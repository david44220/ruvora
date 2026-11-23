"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Link2,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { errorMessage } from "@/i18n/errors";
import { api, ApiError } from "@/lib/api";
import { SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-channels";
import type { CreatorBadge, WeeklyStreakSummary } from "@/lib/retention";
import type { NotificationPrefs } from "@/lib/types";
import { Empty, Notice } from "./ui";

export interface PromoteShareLinkItem {
  id: string;
  slug: string;
  customSlug?: string | null;
  url: string;
  customUrl?: string | null;
  bridgeEnabled?: boolean;
  source: string;
  socialChannel: string;
  campaignId: string | null;
  campaignName: string | null;
  eventsCount: number;
}

export interface CreatorPostPlanItem {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  socialChannel: string;
  title: string;
  scheduledFor: string;
  status: string;
  note: string;
  checklist: {
    linkReady: boolean;
    codeCopied: boolean;
    disclosureIncluded: boolean;
  };
  publishedAt: string | null;
  createdAt: string;
}

export interface CreatorRetentionData {
  totalXp: number;
  level: number;
  streak: WeeklyStreakSummary;
  badges: CreatorBadge[];
  publishedPlansCount: number;
  scheduledPlansCount: number;
  leaderboardOptIn: boolean;
}

export function VanityLinkCard({
  link,
  origin,
  onSaved,
}: {
  link: PromoteShareLinkItem | null;
  origin: string;
  onSaved: () => void;
}) {
  const { locale, t } = useLocale();
  const [draft, setDraft] = useState<{
    linkId: string;
    customSlug: string;
    bridgeEnabled: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ linkId: string; error: boolean; text: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  if (!link) return null;
  const customSlug = draft?.linkId === link.id ? draft.customSlug : (link.customSlug ?? "");
  const bridgeEnabled =
    draft?.linkId === link.id ? draft.bridgeEnabled : Boolean(link.bridgeEnabled);
  const visibleStatus = status?.linkId === link.id ? status : null;
  const activeUrl = link.customUrl ? `${origin}${link.customUrl}` : `${origin}${link.url}`;
  const isCampaignLink = Boolean(link.campaignId);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!link) return;
    setSaving(true);
    setStatus(null);
    try {
      await api("/share-links/customize", {
        shareLinkId: link.id,
        customSlug: customSlug.trim() || null,
        ...(isCampaignLink ? { bridgeEnabled } : {}),
      });
      setDraft(null);
      setStatus({ linkId: link.id, error: false, text: t("p8VanitySaved") });
      onSaved();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      setStatus({ linkId: link.id, error: true, text: errorMessage(code, locale) });
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  }

  return (
    <section className="panel vanity-card">
      <div className="panel-header">
        <div>
          <h2>
            <Link2
              size={16}
              aria-hidden="true"
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
            />
            {t("p8VanityTitle")}
          </h2>
          <p className="panel-description">{t("p8VanityDesc")}</p>
        </div>
        {link.customUrl ? <span className="tag tag-verified">{link.customUrl}</span> : null}
      </div>

      <form className="form-stack" onSubmit={(e) => void save(e)}>
        <label className="field">
          {t("p8VanitySlugLabel")}
          <input
            type="text"
            value={customSlug}
            onChange={(e) =>
              setDraft({
                linkId: link.id,
                customSlug: e.target.value.toLowerCase(),
                bridgeEnabled,
              })
            }
            placeholder={t("p8VanitySlugPlaceholder")}
            maxLength={40}
          />
        </label>

        {isCampaignLink ? (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={bridgeEnabled}
              onChange={(e) =>
                setDraft({
                  linkId: link.id,
                  customSlug,
                  bridgeEnabled: e.target.checked,
                })
              }
            />
            <span>{t("p8VanityBridgeToggle")}</span>
          </label>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="button button-small" disabled={saving}>
            {t(saving ? "working" : "p8VanitySave")}
          </button>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void copyUrl()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {t("p8VanityActiveUrl")}
          </button>
          {isCampaignLink && link.bridgeEnabled ? (
            <a
              href={`/go-card/${encodeURIComponent(link.customSlug || link.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-secondary button-small"
            >
              <ExternalLink size={14} aria-hidden="true" />
              {t("p8VanityBridgePreview")}
            </a>
          ) : null}
        </div>
        {visibleStatus ? <Notice message={visibleStatus.text} error={visibleStatus.error} /> : null}
      </form>
    </section>
  );
}

export function StreakBadgesMilestonePanel({
  retention,
  handle,
}: {
  retention: CreatorRetentionData | undefined;
  handle: string | null;
}) {
  const { locale, t } = useLocale();
  if (!retention) return null;

  return (
    <section className="panel retention-panel">
      <div className="panel-header">
        <div>
          <h2>
            <Flame
              size={16}
              aria-hidden="true"
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
            />
            {t("p8StreakTitle")}
          </h2>
          <p className="panel-description">{t("p8StreakDesc")}</p>
        </div>
        <span className={`tag ${retention.streak.activeThisWeek ? "tag-verified" : ""}`}>
          {retention.streak.activeThisWeek ? t("p8StreakActiveWeek") : t("p8StreakKeepGoing")}
        </span>
      </div>

      <div className="retention-kpi-grid">
        <div className="offer-kpi-item">
          <span className="field-hint">{t("p8StreakWeeksLabel")}</span>
          <strong className="number">
            {retention.streak.currentStreakWeeks} {t("p8StreakWeekUnit")}
          </strong>
        </div>
        <div className="offer-kpi-item">
          <span className="field-hint">{t("p8StreakBestLabel")}</span>
          <strong className="number">
            {retention.streak.longestStreakWeeks} {t("p8StreakWeekUnit")}
          </strong>
        </div>
        <div className="offer-kpi-item">
          <span className="field-hint">{t("p8LeaderboardLevel")}</span>
          <strong className="number">
            {t("p2Level")} {retention.level} · {retention.totalXp} {t("xpUnit")}
          </strong>
        </div>
      </div>

      {retention.badges.length > 0 ? (
        <div
          className="profile-badge-row"
          style={{ justifyContent: "flex-start", marginTop: 14 }}
          aria-label={t("p8BadgesHeading")}
        >
          {retention.badges.map((badge) => (
            <span key={badge.code} className="tag tag-verified">
              <Award size={12} aria-hidden="true" /> {t(badge.labelKey)}
            </span>
          ))}
        </div>
      ) : null}

      {handle ? (
        <div className="form-actions" style={{ marginTop: 16 }}>
          <a
            href={`/share-card/milestone/${encodeURIComponent(handle)}?format=story&lang=${locale}&download=1`}
            className="button button-small"
            download
          >
            <Download size={14} aria-hidden="true" /> {t("p8MilestoneCardStory")}
          </a>
          <a
            href={`/share-card/milestone/${encodeURIComponent(handle)}?format=square&lang=${locale}&download=1`}
            className="button button-secondary button-small"
            download
          >
            <Download size={14} aria-hidden="true" /> {t("p8MilestoneCardSquare")}
          </a>
        </div>
      ) : null}
    </section>
  );
}

export function SocialPostPlannerPanel({
  plans,
  campaigns,
  defaultCampaignId,
  defaultChannel,
  onChanged,
}: {
  plans: CreatorPostPlanItem[];
  campaigns: { id: string; name: string }[];
  defaultCampaignId: string;
  defaultChannel: SocialChannel;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [title, setTitle] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const campaignId = selectedCampaignId ?? defaultCampaignId;
  const [channel, setChannel] = useState<SocialChannel>(defaultChannel);
  const [scheduledLocal, setScheduledLocal] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const iso = new Date(scheduledLocal).toISOString();
      await api("/promote/plans", {
        title: title.trim(),
        campaignId: campaignId || null,
        socialChannel: channel,
        scheduledFor: iso,
        note: note.trim(),
        checklist: { linkReady: true, codeCopied: false, disclosureIncluded: true },
      });
      setTitle("");
      setNote("");
      setFeedback({ error: false, text: t("p8PlannerCreated") });
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      setFeedback({ error: true, text: errorMessage(code, locale) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleChecklist(
    plan: CreatorPostPlanItem,
    key: "linkReady" | "codeCopied" | "disclosureIncluded",
  ) {
    try {
      await api(`/promote/plans/${encodeURIComponent(plan.id)}/update`, {
        checklist: { ...plan.checklist, [key]: !plan.checklist[key] },
      });
      onChanged();
    } catch {
      // ignore transient error
    }
  }

  async function markPublished(plan: CreatorPostPlanItem) {
    try {
      await api(`/promote/plans/${encodeURIComponent(plan.id)}/update`, {
        status: "PUBLISHED",
      });
      onChanged();
    } catch {
      // ignore transient error
    }
  }

  async function removePlan(planId: string) {
    try {
      await api(`/promote/plans/${encodeURIComponent(planId)}/delete`, {});
      onChanged();
    } catch {
      // ignore transient error
    }
  }

  return (
    <section className="panel planner-panel">
      <div className="panel-header">
        <div>
          <h2>
            <Calendar
              size={16}
              aria-hidden="true"
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
            />
            {t("p8PlannerTitle")}
          </h2>
          <p className="panel-description">{t("p8PlannerDesc")}</p>
        </div>
        <span className="tag number">{plans.length}</span>
      </div>

      <form className="form-stack" onSubmit={(e) => void createPlan(e)}>
        <div className="form-grid">
          <label className="field">
            {t("p8PlannerTitleLabel")}
            <input
              type="text"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("p8PlannerTitlePlaceholder")}
            />
          </label>
          <label className="field">
            {t("p8PlannerDateLabel")}
            <input
              type="datetime-local"
              required
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
            />
          </label>
          <label className="field">
            {t("p6ChannelLabel")}
            <select value={channel} onChange={(e) => setChannel(e.target.value as SocialChannel)}>
              {SOCIAL_CHANNELS.filter((c) => c !== "DIRECT" && c !== "WEB_EMBED").map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("campaigns")}
            <select value={campaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
              <option value="">—</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field full-width">
            {t("p8PlannerNoteLabel")}
            <input
              type="text"
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("p8PlannerNotePlaceholder")}
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="button button-small" disabled={saving}>
            <Plus size={15} aria-hidden="true" /> {t(saving ? "working" : "p8PlannerCreate")}
          </button>
        </div>
        {feedback ? <Notice message={feedback.text} error={feedback.error} /> : null}
      </form>

      {plans.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <Empty>{t("p8PlannerEmpty")}</Empty>
        </div>
      ) : (
        <div className="planner-list">
          {plans.map((plan) => (
            <article key={plan.id} className="planner-item">
              <div className="planner-item-head">
                <div>
                  <strong>{plan.title}</strong>
                  <p className="field-hint">
                    {plan.socialChannel}
                    {plan.campaignName ? ` · ${plan.campaignName}` : ""} ·{" "}
                    {new Date(plan.scheduledFor).toLocaleString(
                      locale === "fr" ? "fr-FR" : "en-US",
                      { dateStyle: "medium", timeStyle: "short" },
                    )}
                  </p>
                </div>
                <span className={`tag ${plan.status === "PUBLISHED" ? "tag-verified" : ""}`}>
                  {plan.status === "PUBLISHED"
                    ? t("p8PlannerStatusPublished")
                    : plan.status === "SKIPPED"
                      ? t("p8PlannerStatusSkipped")
                      : t("p8PlannerStatusPlanned")}
                </span>
              </div>
              {plan.note ? <p className="field-hint">{plan.note}</p> : null}

              <div className="planner-checklist">
                <label className="checkbox-chip">
                  <input
                    type="checkbox"
                    checked={plan.checklist.linkReady}
                    onChange={() => void toggleChecklist(plan, "linkReady")}
                  />
                  <span>{t("p8PlannerCheckLink")}</span>
                </label>
                <label className="checkbox-chip">
                  <input
                    type="checkbox"
                    checked={plan.checklist.codeCopied}
                    onChange={() => void toggleChecklist(plan, "codeCopied")}
                  />
                  <span>{t("p8PlannerCheckCode")}</span>
                </label>
                <label className="checkbox-chip">
                  <input
                    type="checkbox"
                    checked={plan.checklist.disclosureIncluded}
                    onChange={() => void toggleChecklist(plan, "disclosureIncluded")}
                  />
                  <span>{t("p8PlannerCheckDisclosure")}</span>
                </label>
              </div>

              <div className="form-actions">
                {plan.status !== "PUBLISHED" ? (
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => void markPublished(plan)}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" /> {t("p8PlannerMarkPublished")}
                  </button>
                ) : null}
                <a
                  href={`/api/promote/plans/${encodeURIComponent(plan.id)}/ics`}
                  className="button button-secondary button-small"
                  download
                >
                  <Download size={14} aria-hidden="true" /> {t("p8PlannerExportIcs")}
                </a>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => void removePlan(plan.id)}
                >
                  <Trash2 size={14} aria-hidden="true" /> {t("p8PlannerDelete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function NotificationPrefsPanel() {
  const { locale, t } = useLocale();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    campaignMatch: true,
    payoutUpdates: true,
    ugcUpdates: true,
    weeklyDigestEmail: false,
  });
  const [development, setDevelopment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    api<{ preferences: NotificationPrefs; development: boolean }>("/notifications/preferences")
      .then((res) => {
        if (!active) return;
        setPrefs(res.preferences);
        setDevelopment(Boolean(res.development));
      })
      .catch(() => {
        // Keep defaults if offline
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api("/notifications/preferences", prefs);
      setStatus({ error: false, text: t("p8NotifPrefsSaved") });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      setStatus({ error: true, text: errorMessage(code, locale) });
    } finally {
      setSaving(false);
    }
  }

  async function queueDigest() {
    setSendingDigest(true);
    setStatus(null);
    try {
      await api("/notifications/digest", {});
      setStatus({ error: false, text: t("p8NotifDigestQueued") });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      setStatus({ error: true, text: errorMessage(code, locale) });
    } finally {
      setSendingDigest(false);
    }
  }

  return (
    <section className="panel notif-prefs-panel" style={{ marginTop: 22 }}>
      <div className="panel-header">
        <div>
          <h2>
            <Bell
              size={16}
              aria-hidden="true"
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
            />
            {t("p8NotifPrefsTitle")}
          </h2>
          <p className="panel-description">{t("p8NotifPrefsDesc")}</p>
        </div>
      </div>

      <form className="form-stack" onSubmit={(e) => void save(e)}>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={prefs.campaignMatch}
            onChange={(e) => setPrefs((p) => ({ ...p, campaignMatch: e.target.checked }))}
          />
          <span>{t("p8NotifPrefMatch")}</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={prefs.payoutUpdates}
            onChange={(e) => setPrefs((p) => ({ ...p, payoutUpdates: e.target.checked }))}
          />
          <span>{t("p8NotifPrefPayout")}</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={prefs.ugcUpdates}
            onChange={(e) => setPrefs((p) => ({ ...p, ugcUpdates: e.target.checked }))}
          />
          <span>{t("p8NotifPrefUgc")}</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={prefs.weeklyDigestEmail}
            onChange={(e) => setPrefs((p) => ({ ...p, weeklyDigestEmail: e.target.checked }))}
          />
          <span>{t("p8NotifPrefDigest")}</span>
        </label>

        <div className="form-actions">
          <button type="submit" className="button button-small" disabled={saving}>
            {t(saving ? "working" : "p8NotifPrefsSave")}
          </button>
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={sendingDigest}
            onClick={() => void queueDigest()}
          >
            <Mail size={14} aria-hidden="true" />
            {t(sendingDigest ? "working" : "p8NotifDigestSendTest")}
          </button>
        </div>
        {development ? <p className="field-hint">{t("p8NotifDigestDevHint")}</p> : null}
        {status ? <Notice message={status.text} error={status.error} /> : null}
      </form>
    </section>
  );
}
