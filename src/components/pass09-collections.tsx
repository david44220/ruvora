"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  BadgeCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  Flame,
  FlaskConical,
  Layers3,
  Mail,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { COLLECTION_THEMES, slugifyCollectionTitle, type CollectionTheme } from "@/lib/collections";
import type { PublicCollectionData } from "@/server/collections";
import { Empty, Eyebrow, Footer, Notice, Orb, PublicNav } from "./ui";

export interface CreatorCollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  published: boolean;
  viewsCount: number;
  publicUrl: string | null;
  updatedAt: string;
  items: {
    id: string;
    campaignId: string;
    creatorNote: string;
    sortOrder: number;
    campaignName: string;
    objective: string;
    state: string;
  }[];
}

export interface AudienceSummaryData {
  enabled: boolean;
  prompt: string;
  confirmedCount: number;
  pendingCount: number;
  unsubscribedCount: number;
  subscribers: {
    id: string;
    email: string;
    sourceSlug: string;
    locale: string;
    confirmedAt: string;
  }[];
}

/**
 * Reusable public double-opt-in email subscription card rendered on /@handle and /c/[handle]/[slug].
 * Automatically processes #audience_confirm=<token> and #audience_unsub=<token> URL fragments.
 */
export function PublicAudienceCaptureCard({
  handle,
  prompt,
  sourceSlug,
}: {
  handle: string;
  prompt?: string;
  sourceSlug: string;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [doneBanner, setDoneBanner] = useState<string | null>(null);
  const hashHandled = useRef(false);

  useEffect(() => {
    if (hashHandled.current || typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const confirmMatch = /audience_confirm=([^&]+)/.exec(hash);
    const unsubMatch = /audience_unsub=([^&]+)/.exec(hash);
    if (!confirmMatch && !unsubMatch) return;
    hashHandled.current = true;
    if (confirmMatch?.[1]) {
      const token = decodeURIComponent(confirmMatch[1]);
      void api("/audience/confirm", { token })
        .then(() => {
          setDoneBanner(t("p9AudienceConfirmedBanner"));
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        })
        .catch(() => {});
    } else if (unsubMatch?.[1]) {
      const token = decodeURIComponent(unsubMatch[1]);
      void api("/audience/unsubscribe", { token })
        .then(() => {
          setDoneBanner(t("p9AudienceUnsubscribedBanner"));
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        })
        .catch(() => {});
    }
  }, [t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api(`/audience/${encodeURIComponent(handle)}/subscribe`, {
        email: email.trim(),
        locale,
        sourceSlug,
        consent: true,
      });
      setEmail("");
      setConsent(false);
    }, t("p9AudienceSubscribePending"));
  }

  return (
    <section className="panel audience-capture-card">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p9AudiencePublicEyebrow")}</Eyebrow>
          <h3>{t("p9AudiencePublicDefaultHeading")}</h3>
          <p className="panel-description">
            {prompt?.trim() ? prompt : t("p9AudiencePublicDefaultPrompt")}
          </p>
        </div>
        <Mail size={20} className="accent-icon" />
      </div>
      {doneBanner && <Notice message={doneBanner} />}
      <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="audience-capture-row">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">{t("p9AudienceEmailLabel")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("p9AudienceEmailPlaceholder")}
              maxLength={254}
              required
            />
          </label>
          <button
            type="submit"
            className="button button-small"
            disabled={action.busy || !consent || !email.trim()}
          >
            <Mail size={14} />
            {t(action.busy ? "working" : "p9AudienceSubscribeBtn")}
          </button>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>{t("p9AudienceConsentLabel")}</span>
        </label>
        {action.notice && <Notice message={action.notice} error={action.failed} />}
      </form>
    </section>
  );
}

/** Public SSR page for a creator's curated multi-offer pack (/c/[handle]/[slug]). */
export function PublicCollectionView({
  data,
  canonicalUrl,
}: {
  data: PublicCollectionData;
  canonicalUrl: string;
}) {
  const { t, locale } = useLocale();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [sharedMsg, setSharedMsg] = useState<string | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || !data.entry) return;
    tracked.current = true;
    void api("/attribution/start", { slug: data.entry.slug }).catch(() => {});
  }, [data.entry]);

  async function sharePack() {
    const url = typeof window !== "undefined" ? window.location.href : canonicalUrl;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: data.collection.title, url });
        setSharedMsg(t("p9CollectionCopied"));
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setSharedMsg(t("p9CollectionCopied"));
    }
  }

  const c = data.creator;

  return (
    <>
      <PublicNav />
      <main id="main" className="public-page">
        <div className="public-profile-shell">
          <Orb
            className="public-profile-backdrop"
            size={760}
            loading="eager"
            sizes="(max-width: 760px) 680px, 860px"
          />
          <article
            className="public-profile public-collection-page"
            data-theme={data.collection.theme}
          >
            <div className="public-profile-cover">
              <Orb size={300} priority sizes="(max-width: 760px) 320px, 360px" />
              <span className="tag">
                <Layers3 size={12} />
                {t("p9CollectionPublicEyebrow")}
              </span>
            </div>
            <div className="public-profile-content">
              <div className="profile-badge-row" style={{ marginBottom: 12 }}>
                <Link href={`/@${c.handle}`} className="text-link">
                  <ArrowLeft size={14} />
                  {t("p9CollectionBackProfile")}
                </Link>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => void sharePack()}
                >
                  <Share2 size={14} />
                  {t("p9CollectionShareNative")}
                </button>
              </div>
              {sharedMsg && <Notice message={sharedMsg} />}

              <h1>{data.collection.title}</h1>
              {data.collection.description && (
                <p className="profile-bio">{data.collection.description}</p>
              )}

              <div className="profile-badge-row">
                <span className="tag">
                  {t("p9CollectionPublicBy")} <strong>{c.displayName}</strong> (@{c.handle})
                </span>
                <span className="tag">
                  {data.items.length} {t("p9CollectionOffersCount")}
                </span>
                {c.audienceStatus === "VERIFIED" && (
                  <span className="tag tag-verified">
                    <BadgeCheck size={13} />
                    {t("p4AudienceVerifiedBadge")}
                  </span>
                )}
                {c.streakWeeks > 0 && (
                  <span className="tag tag-verified">
                    <Flame size={13} />
                    {c.streakWeeks} {t("p8StreakWeekUnit")}
                  </span>
                )}
              </div>

              {c.badges.length > 0 && (
                <div className="profile-badge-row">
                  {c.badges.slice(0, 4).map((b) => (
                    <span key={b.code} className="tag">
                      <Award size={12} />
                      {t(b.labelKey as MessageKey)}
                    </span>
                  ))}
                </div>
              )}

              {data.development && (
                <div className="dev-banner" style={{ margin: "14px auto" }}>
                  <FlaskConical size={14} />
                  {t("development")}
                </div>
              )}

              <div className="featured-opportunities" style={{ marginTop: 22 }}>
                {data.items.length === 0 ? (
                  <Empty>{t("p9CollectionNoActiveOffers")}</Empty>
                ) : (
                  data.items.map((item) => (
                    <article key={item.id} className="profile-opportunity">
                      <div className="profile-badge-row">
                        <span className="tag">{t("p6PublicPartnerTag")}</span>
                        <span className="tag">
                          {t(("objective" + item.objective) as MessageKey)}
                        </span>
                        <span className="tag">{item.budgetRemainingPct}%</span>
                      </div>
                      <h3>{item.name}</h3>
                      {item.creatorNote ? (
                        <p className="public-creator-note">
                          <strong>{t("p6PublicCreatorNoteLabel")}:</strong> {item.creatorNote}
                        </p>
                      ) : (
                        <p>{item.description || t("p2OpportunityIntro")}</p>
                      )}
                      {item.promoCode && (
                        <button
                          type="button"
                          className="promo-inline-pill"
                          onClick={() => {
                            void navigator.clipboard.writeText(item.promoCode!);
                            setCopiedCode(item.promoCode!);
                          }}
                        >
                          <span>
                            {t("p4PromoCodeLabel")}: <strong>{item.promoCode}</strong>
                            {item.discountLabel ? ` (${item.discountLabel})` : ""}
                          </span>
                          <Copy size={13} />
                          {copiedCode === item.promoCode && <small>{t("p4PromoCopied")}</small>}
                        </button>
                      )}
                      <div className="form-actions" style={{ justifyContent: "center" }}>
                        <Link href={item.url} className="button button-small">
                          {t("p2ExploreOpportunity")}
                          <ArrowUpRight size={15} />
                        </Link>
                        <Link href={item.offerUrl} className="button button-small button-secondary">
                          {t("p8OfferViewDetails")}
                        </Link>
                      </div>
                      {item.disclosureNote && <small>{item.disclosureNote}</small>}
                    </article>
                  ))
                )}
              </div>

              {c.audienceCaptureEnabled && (
                <div style={{ marginTop: 24, textAlign: "left" }}>
                  <PublicAudienceCaptureCard
                    handle={c.handle}
                    prompt={c.audienceCapturePrompt}
                    sourceSlug={`collection:${data.collection.slug}`}
                  />
                </div>
              )}

              {data.referralEntry && (
                <div className="public-viral-cta" style={{ marginTop: 22 }}>
                  <Eyebrow>{t("p2Referrals")}</Eyebrow>
                  <h3>{t("p6PublicViralTitle")}</h3>
                  <p className="panel-description">{t("p6PublicViralDesc")}</p>
                  <Link href={data.referralEntry.url} className="button button-small">
                    <Sparkles size={14} />
                    {t("p6PublicViralCta")}
                  </Link>
                  <p className="field-hint" style={{ marginTop: 8 }}>
                    {t("heroDisclaimer")} · {locale.toUpperCase()}
                  </p>
                </div>
              )}
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Creator Studio panel in /app/promote to curate, publish, and share multi-offer packs. */
export function CollectionsManagerPanel({
  handle,
  campaigns,
  collections,
  onChanged,
}: {
  handle: string | null;
  campaigns: { id: string; name: string; objective: string; canParticipate?: boolean }[];
  collections: CreatorCollectionSummary[];
  onChanged: () => void;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState<CollectionTheme>("obsidian");
  const [published, setPublished] = useState(true);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [notesByCampaign, setNotesByCampaign] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const eligibleCampaigns = campaigns.filter((c) => c.canParticipate !== false);

  function toggleCampaign(id: string) {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  }

  async function saveCollection(e: FormEvent) {
    e.preventDefault();
    const resolvedSlug = slug.trim() || slugifyCollectionTitle(title);
    await action.run(async () => {
      await api("/promote/collections", {
        title: title.trim(),
        slug: resolvedSlug,
        description: description.trim(),
        theme,
        published,
        items: pickedIds.map((campaignId) => ({
          campaignId,
          creatorNote: (notesByCampaign[campaignId] ?? "").trim(),
        })),
      });
      setTitle("");
      setSlug("");
      setDescription("");
      setPickedIds([]);
      setNotesByCampaign({});
      onChanged();
    }, t("p9CollectionSaved"));
  }

  async function removeCollection(id: string) {
    await action.run(async () => {
      await api(`/promote/collections/${encodeURIComponent(id)}/delete`, {});
      onChanged();
    }, t("p9CollectionDeleted"));
  }

  async function copyUrl(publicUrl: string, id: string) {
    const abs =
      typeof window !== "undefined" ? new URL(publicUrl, window.location.origin).href : publicUrl;
    await navigator.clipboard.writeText(abs);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
  }

  return (
    <section className="panel collections-manager-panel">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p9CollectionsEyebrow")}</Eyebrow>
          <h2>{t("p9CollectionsTitle")}</h2>
          <p className="panel-description">{t("p9CollectionsSubtitle")}</p>
        </div>
        <span className="tag">
          <Layers3 size={13} /> {collections.length}/12
        </span>
      </div>

      {handle && eligibleCampaigns.length > 0 && (
        <form className="form-stack" onSubmit={(e) => void saveCollection(e)}>
          <div className="form-grid">
            <label className="field">
              {t("p9CollectionTitleLabel")}
              <input
                value={title}
                onChange={(e) => {
                  const next = e.target.value;
                  setTitle(next);
                  if (!slug.trim()) setSlug(slugifyCollectionTitle(next));
                }}
                placeholder={t("p9CollectionTitlePlaceholder")}
                minLength={2}
                maxLength={70}
                required
              />
            </label>
            <label className="field">
              {t("p9CollectionSlugLabel")}
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder={t("p9CollectionSlugPlaceholder")}
                pattern="[a-z0-9-]{3,40}"
                maxLength={40}
              />
            </label>
            <label className="field">
              {t("p9CollectionThemeLabel")}
              <select value={theme} onChange={(e) => setTheme(e.target.value as CollectionTheme)}>
                {COLLECTION_THEMES.map((th) => (
                  <option key={th} value={th}>
                    {th}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full-width">
              {t("p9CollectionDescLabel")}
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("p9CollectionDescPlaceholder")}
                maxLength={260}
              />
            </label>
          </div>

          <div>
            <p className="field-section-title">{t("p9CollectionSelectCampaigns")}</p>
            <div className="promote-campaign-picks">
              {eligibleCampaigns.slice(0, 12).map((c) => {
                const picked = pickedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip-toggle ${picked ? "chip-active" : ""}`}
                    aria-pressed={picked}
                    onClick={() => toggleCampaign(c.id)}
                  >
                    {picked ? <Check size={13} /> : <Plus size={13} />}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {pickedIds.length > 0 && (
            <div className="form-grid">
              {pickedIds.map((cid) => {
                const camp = eligibleCampaigns.find((c) => c.id === cid);
                if (!camp) return null;
                return (
                  <label key={cid} className="field">
                    {camp.name}
                    <input
                      value={notesByCampaign[cid] ?? ""}
                      onChange={(e) =>
                        setNotesByCampaign((prev) => ({ ...prev, [cid]: e.target.value }))
                      }
                      placeholder={t("p9CollectionNotePlaceholder")}
                      maxLength={220}
                    />
                  </label>
                );
              })}
            </div>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            <span>{t("p9CollectionPublishedLabel")}</span>
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="button button-small"
              disabled={action.busy || pickedIds.length === 0 || title.trim().length < 2}
            >
              <Layers3 size={14} />
              {t(action.busy ? "working" : "p9CollectionSaveBtn")}
            </button>
          </div>
          {action.notice && <Notice message={action.notice} error={action.failed} />}
        </form>
      )}

      {collections.length === 0 ? (
        <Empty>{t("p9CollectionEmpty")}</Empty>
      ) : (
        <div className="collection-list-grid">
          {collections.map((col) => (
            <article key={col.id} className="collection-admin-card">
              <div className="collection-admin-head">
                <div>
                  <h3>{col.title}</h3>
                  <p className="field-hint">
                    <code>{col.publicUrl ?? `/c/${handle}/${col.slug}`}</code> · {col.items.length}{" "}
                    {t("p9CollectionOffersCount")} · {col.viewsCount} {t("p9CollectionViews")}
                  </p>
                </div>
                <span className="tag">{col.theme}</span>
              </div>
              {col.description && <p className="panel-description">{col.description}</p>}
              <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                {col.items.map((it) => (
                  <span key={it.id} className="tag">
                    {it.campaignName}
                  </span>
                ))}
              </div>
              <div className="form-actions">
                {col.publicUrl && (
                  <>
                    <Link href={col.publicUrl} className="button button-small">
                      <ExternalLink size={13} />
                      {t("p9CollectionOpenBtn")}
                    </Link>
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onClick={() => void copyUrl(col.publicUrl!, col.id)}
                    >
                      {copiedId === col.id ? <Check size={13} /> : <Copy size={13} />}
                      {t(copiedId === col.id ? "p9CollectionCopied" : "p9CollectionCopyUrlBtn")}
                    </button>
                  </>
                )}
                {handle && (
                  <>
                    <a
                      href={`/share-card/collection/${encodeURIComponent(handle)}?collection=${encodeURIComponent(col.slug)}&format=banner&lang=${locale}&download=1`}
                      className="button button-small button-secondary"
                      download
                    >
                      <Download size={13} />
                      {t("p9CollectionOgCardBtn")}
                    </a>
                    <a
                      href={`/share-card/collection/${encodeURIComponent(handle)}?collection=${encodeURIComponent(col.slug)}&format=story&lang=${locale}&download=1`}
                      className="button button-small button-secondary"
                      download
                    >
                      <Download size={13} />
                      {t("p9CollectionStoryCardBtn")}
                    </a>
                  </>
                )}
                <button
                  type="button"
                  className="button button-small button-secondary"
                  disabled={action.busy}
                  onClick={() => void removeCollection(col.id)}
                >
                  <Trash2 size={13} />
                  {t("p9CollectionDeleteBtn")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Creator Studio panel in /app/promote displaying double opt-in subscribers & CSV export. */
export function AudienceSubscribersPanel({
  audience,
  onChanged,
}: {
  audience: AudienceSummaryData;
  onChanged: () => void;
}) {
  const { t, locale } = useLocale();
  const action = useAction();

  async function removeSubscriber(id: string) {
    await action.run(async () => {
      await api(`/promote/audience/${encodeURIComponent(id)}/delete`, {});
      onChanged();
    }, t("p9AudienceRemoved"));
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p9AudienceEyebrow")}</Eyebrow>
          <h2>{t("p9AudienceTitle")}</h2>
          <p className="panel-description">{t("p9AudienceSubtitle")}</p>
        </div>
        <div className="form-actions">
          <a
            href="/api/promote/audience/export"
            className="button button-small button-secondary"
            download
          >
            <Download size={14} />
            {t("p9AudienceExportCsvBtn")}
          </a>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <small>{t("p9AudienceConfirmedCount")}</small>
          <strong className="number">{audience.confirmedCount}</strong>
        </div>
        <div className="stat-card">
          <small>{t("p9AudiencePendingCount")}</small>
          <strong className="number">{audience.pendingCount}</strong>
        </div>
        <div className="stat-card">
          <small>{t("p9AudienceUnsubCount")}</small>
          <strong className="number">{audience.unsubscribedCount}</strong>
        </div>
      </div>

      {action.notice && <Notice message={action.notice} error={action.failed} />}

      {audience.subscribers.length === 0 ? (
        <Empty>{t("p9AudienceNoSubscribers")}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("email")}</th>
                <th>Source</th>
                <th>{t("date")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {audience.subscribers.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <Users size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
                    {sub.email}
                  </td>
                  <td>
                    <span className="tag">{sub.sourceSlug}</span>
                  </td>
                  <td>{new Date(sub.confirmedAt).toLocaleDateString(locale)}</td>
                  <td>
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      disabled={action.busy}
                      onClick={() => void removeSubscriber(sub.id)}
                    >
                      <Trash2 size={13} />
                      {t("p9AudienceRemoveBtn")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("p9AudienceZeroRuNote")}
      </p>
    </section>
  );
}
