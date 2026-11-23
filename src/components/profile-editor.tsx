"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { type Role, type User } from "@/lib/types";
import { Notice } from "./ui";

type SocialRow = { key: number; platform: string; url: string; followers: string };
type LinkRow = {
  key: number;
  id?: string;
  title: string;
  url: string;
  pinned: boolean;
  startsAt: string;
  endsAt: string;
};
const platforms = ["Instagram", "TikTok", "YouTube", "Twitch", "X", "Discord", "Website"];
const firstName = (name: string, index: number) => (index === 0 ? name : `${name}-${index}`);
const httpsPattern = "https://[^\\s]+";

function toLocalDatetimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Keep all persisted rows; removing one is always an explicit user action. */
export function ProfileForm({ user, onSaved }: { user: User; onSaved?: (user: User) => void }) {
  const { t, locale } = useLocale();
  const action = useAction();
  const linkClicks = useResource<{ totalClicks: number; byLinkId: Record<string, number> }>(
    "/profiles/link-clicks",
  );
  const nextKey = useRef(100);
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [socials, setSocials] = useState<SocialRow[]>(() =>
    user.socialLinks?.length
      ? user.socialLinks.map((social, key) => ({
          ...social,
          key,
          followers: String(social.followers),
        }))
      : [{ key: 0, platform: "Instagram", url: "", followers: "0" }],
  );
  const [links, setLinks] = useState<LinkRow[]>(() =>
    user.customLinks?.length
      ? user.customLinks.map((link, key) => ({
          key,
          id: link.id,
          title: link.title,
          url: link.url,
          pinned: Boolean(link.pinned),
          startsAt: toLocalDatetimeInput(link.startsAt),
          endsAt: toLocalDatetimeInput(link.endsAt),
        }))
      : [{ key: 0, title: "", url: "", pinned: false, startsAt: "", endsAt: "" }],
  );

  function updateSocial(key: number, update: Partial<Omit<SocialRow, "key">>) {
    setSocials((rows) => rows.map((row) => (row.key === key ? { ...row, ...update } : row)));
  }
  function updateLink(key: number, update: Partial<Omit<LinkRow, "key">>) {
    setLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...update } : row)));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const rawLangs = String(fields.get("preferredLanguages") || "")
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter((l): l is "fr" | "en" | "es" | "de" | "it" | "pt" =>
        ["fr", "en", "es", "de", "it", "pt"].includes(l),
      );
    const result = await action.run(
      () =>
        api<{ user: User }>("/profile", {
          handle: String(fields.get("handle")).trim().toLowerCase(),
          displayName: String(fields.get("displayName")).trim(),
          bio: String(fields.get("bio")).trim(),
          category: String(fields.get("category")).trim(),
          country: String(fields.get("country")).trim().toUpperCase(),
          city: String(fields.get("city") || "").trim(),
          preferredLanguages: rawLangs.length ? rawLangs : ["fr", "en"],
          profileTheme: String(fields.get("profileTheme") || "obsidian"),
          autoMonetize: fields.get("autoMonetize") === "on",
          directoryOptIn: fields.get("directoryOptIn") === "on",
          leaderboardOptIn: fields.get("leaderboardOptIn") === "on",
          audienceCaptureEnabled: fields.get("audienceCaptureEnabled") === "on",
          audienceCapturePrompt: String(fields.get("audienceCapturePrompt") || "").trim(),
          billingEntityName: String(fields.get("billingEntityName") || "").trim(),
          vatNumber: String(fields.get("vatNumber") || "").trim(),
          locale,
          ageEligible: fields.get("adult") === "on",
          termsAccepted: fields.get("terms") === "on",
          roles: roles.filter((role) => role !== "ADMIN"),
          socials: socials
            .filter((row) => row.url.trim())
            .map((row) => ({
              platform: row.platform,
              url: row.url.trim(),
              followers: Number(row.followers || "0"),
            })),
          links: links
            .filter((row) => row.url.trim())
            .map((row) => ({
              ...(row.id ? { id: row.id } : {}),
              title: row.title.trim(),
              url: row.url.trim(),
              ...(row.pinned ? { pinned: true } : {}),
              ...(row.startsAt ? { startsAt: new Date(row.startsAt).toISOString() } : {}),
              ...(row.endsAt ? { endsAt: new Date(row.endsAt).toISOString() } : {}),
            })),
        }),
      t("saved"),
    );
    if (result) {
      setRoles(result.user.roles);
      if (result.user.customLinks?.length) {
        setLinks(
          result.user.customLinks.map((link, key) => ({
            key,
            id: link.id,
            title: link.title,
            url: link.url,
            pinned: Boolean(link.pinned),
            startsAt: toLocalDatetimeInput(link.startsAt),
            endsAt: toLocalDatetimeInput(link.endsAt),
          })),
        );
      }
      onSaved?.(result.user);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack settings-form">
      <div className="form-grid">
        <label className="field">
          {t("name")}
          <input
            name="displayName"
            defaultValue={user.displayName}
            minLength={2}
            maxLength={60}
            autoComplete="name"
            required
          />
        </label>
        <label className="field">
          {t("handle")}
          <input
            name="handle"
            defaultValue={user.handle || ""}
            pattern="[a-z0-9_]{3,24}"
            minLength={3}
            maxLength={24}
            required
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <label className="field full-width">
          {t("bio")}
          <textarea name="bio" defaultValue={user.bio || ""} maxLength={300} />
        </label>
        <label className="field">
          {t("category")}
          <input name="category" defaultValue={user.category || ""} maxLength={40} />
        </label>
        <label className="field">
          {t("country")}
          <input
            name="country"
            defaultValue={user.country || "FR"}
            pattern="[A-Za-z]{2}"
            minLength={2}
            maxLength={2}
            required
            autoCapitalize="characters"
            autoComplete="country"
          />
        </label>
        <label className="field">
          {t("p4CityLabel")}
          <input name="city" defaultValue={user.city || ""} maxLength={60} placeholder="Paris" />
        </label>
        <label className="field">
          {t("p4LanguagesLabel")}
          <input
            name="preferredLanguages"
            defaultValue={(user.preferredLanguages ?? ["fr", "en"]).join(", ")}
            maxLength={40}
          />
        </label>
        <label className="field">
          {t("p4ProfileThemeLabel")}
          <select name="profileTheme" defaultValue={user.profileTheme || "obsidian"}>
            <option value="obsidian">{t("p4ThemeObsidian")}</option>
            <option value="champagne">{t("p4ThemeChampagne")}</option>
            <option value="emerald-dusk">{t("p4ThemeEmeraldDusk")}</option>
            <option value="amber-glow">{t("p4ThemeAmberGlow")}</option>
          </select>
        </label>
        <div className="field" style={{ justifyContent: "center" }}>
          <label className="checkbox-field">
            <input
              name="autoMonetize"
              type="checkbox"
              defaultChecked={user.autoMonetize !== false}
            />
            {t("p4AutoMonetizeLabel")}
          </label>
          <span className="field-hint">{t("p4AutoMonetizeHint")}</span>
        </div>
        <div className="field full-width">
          <label className="checkbox-field">
            <input
              name="directoryOptIn"
              type="checkbox"
              defaultChecked={user.directoryOptIn !== false}
            />
            {t("p5DirectoryOptIn")}
          </label>
          <span className="field-hint">{t("p5DirectoryOptInHelp")}</span>
        </div>
        <div className="field full-width">
          <label className="checkbox-field">
            <input
              name="leaderboardOptIn"
              type="checkbox"
              defaultChecked={Boolean(user.leaderboardOptIn)}
            />
            {t("p8LeaderboardOptInLabel")}
          </label>
          <span className="field-hint">{t("p8LeaderboardOptInHint")}</span>
        </div>
        <div className="field full-width">
          <label className="checkbox-field">
            <input
              name="audienceCaptureEnabled"
              type="checkbox"
              defaultChecked={user.audienceCaptureEnabled !== false}
            />
            {t("p9AudienceEnableLabel")}
          </label>
          <input
            name="audienceCapturePrompt"
            defaultValue={user.audienceCapturePrompt || ""}
            placeholder={t("p9AudiencePromptPlaceholder")}
            maxLength={120}
            aria-label={t("p9AudiencePromptLabel")}
          />
        </div>
        <label className="field">
          {t("p5BillingEntity")}
          <input
            name="billingEntityName"
            defaultValue={user.billingEntityName || ""}
            maxLength={120}
          />
        </label>
        <label className="field">
          {t("p5VatNumber")}
          <input name="vatNumber" defaultValue={user.vatNumber || ""} maxLength={40} />
        </label>
      </div>

      {socials.map((social, index) => (
        <fieldset
          className="form-stack"
          key={social.key}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <legend className="field-hint" style={{ marginBottom: 12 }}>
            {t("socialPlatform")} {index + 1}
          </legend>
          <div className="form-grid">
            <label className="field">
              {t("socialPlatform")}
              <select
                name={firstName("platform", index)}
                value={social.platform}
                onChange={(event) => updateSocial(social.key, { platform: event.target.value })}
              >
                {!platforms.includes(social.platform) && (
                  <option value={social.platform}>{social.platform}</option>
                )}
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("followers")}
              <input
                name={firstName("followers", index)}
                type="number"
                min="0"
                step="1"
                max="1000000000"
                value={social.followers}
                onChange={(event) => updateSocial(social.key, { followers: event.target.value })}
              />
            </label>
            <label className="field full-width">
              {t("socialUrl")}
              <input
                name={firstName("socialUrl", index)}
                type="url"
                maxLength={2048}
                pattern={httpsPattern}
                required={Number(social.followers) > 0}
                value={social.url}
                onChange={(event) => updateSocial(social.key, { url: event.target.value })}
              />
              <span className="field-hint">{t("selfDeclared")}</span>
            </label>
          </div>
          <div>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={action.busy}
              onClick={() => setSocials((rows) => rows.filter((row) => row.key !== social.key))}
              aria-label={`${t("remove")} ${t("socialPlatform")} ${index + 1}`}
            >
              <Trash2 size={15} />
              {t("remove")}
            </button>
          </div>
        </fieldset>
      ))}
      <div>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={action.busy || socials.length >= 10}
          onClick={() =>
            setSocials((rows) => [
              ...rows,
              { key: nextKey.current++, platform: "Instagram", url: "", followers: "0" },
            ])
          }
        >
          <Plus size={15} />
          {t("addSocial")}
        </button>
      </div>

      {links.map((link, index) => {
        const clickCount = link.id ? (linkClicks.data?.byLinkId[link.id] ?? 0) : 0;
        return (
          <fieldset
            className="form-stack"
            key={link.key}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <legend className="field-hint" style={{ marginBottom: 12 }}>
              {t("linkTitleLabel")} {index + 1}
              {link.id && (
                <>
                  {" "}
                  · <strong>{clickCount}</strong> {t("p7LinkClicksLabel")}
                </>
              )}
            </legend>
            <div className="form-grid">
              <label className="field">
                {t("linkTitleLabel")}
                <input
                  name={firstName("linkTitle", index)}
                  maxLength={50}
                  required={Boolean(link.url.trim())}
                  value={link.title}
                  onChange={(event) => updateLink(link.key, { title: event.target.value })}
                />
              </label>
              <label className="field">
                {t("linkUrl")}
                <input
                  name={firstName("linkUrl", index)}
                  type="url"
                  maxLength={2048}
                  pattern={httpsPattern}
                  required={Boolean(link.title.trim())}
                  value={link.url}
                  onChange={(event) => updateLink(link.key, { url: event.target.value })}
                />
              </label>
              <label className="field">
                {t("p7LinkStartsAt")}
                <input
                  name={firstName("linkStartsAt", index)}
                  type="datetime-local"
                  value={link.startsAt}
                  onChange={(event) => updateLink(link.key, { startsAt: event.target.value })}
                />
              </label>
              <label className="field">
                {t("p7LinkEndsAt")}
                <input
                  name={firstName("linkEndsAt", index)}
                  type="datetime-local"
                  value={link.endsAt}
                  onChange={(event) => updateLink(link.key, { endsAt: event.target.value })}
                />
              </label>
            </div>
            <div
              className="form-actions"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={link.pinned}
                  onChange={(event) => updateLink(link.key, { pinned: event.target.checked })}
                />
                {t("p7LinkPinned")}
              </label>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={action.busy}
                onClick={() => setLinks((rows) => rows.filter((row) => row.key !== link.key))}
                aria-label={`${t("remove")} ${t("linkTitleLabel")} ${index + 1}`}
              >
                <Trash2 size={15} />
                {t("remove")}
              </button>
            </div>
          </fieldset>
        );
      })}
      <p className="field-hint">{t("p7LinkScheduleHint")}</p>
      <div>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={action.busy || links.length >= 12}
          onClick={() =>
            setLinks((rows) => [
              ...rows,
              {
                key: nextKey.current++,
                title: "",
                url: "",
                pinned: false,
                startsAt: "",
                endsAt: "",
              },
            ])
          }
        >
          <Plus size={15} />
          {t("addLink")}
        </button>
      </div>

      <fieldset className="role-options">
        <legend>{t("roleQuestion")}</legend>
        {(["USER", "CREATOR", "ADVERTISER"] as const).map((role) => (
          <label className="checkbox-field" key={role}>
            <input
              type="checkbox"
              checked={roles.includes(role)}
              disabled={role === "USER" || user.roles.includes(role)}
              onChange={(event) =>
                setRoles((current) =>
                  event.target.checked
                    ? [...new Set([...current, role])]
                    : current.filter((item) => item !== role),
                )
              }
            />
            {t(`role${role}`)}
          </label>
        ))}
      </fieldset>
      <label className="checkbox-field">
        <input name="adult" type="checkbox" required defaultChecked={user.onboarded} />
        {t("adult")}
      </label>
      <label className="checkbox-field">
        <input name="terms" type="checkbox" required defaultChecked={user.onboarded} />
        <span>
          <Link href="/terms">{t("terms")}</Link> · <Link href="/privacy">{t("privacy")}</Link>
        </span>
      </label>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
      <div>
        <button className="button" disabled={action.busy}>
          {t(action.busy ? "working" : "saveProfile")}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
