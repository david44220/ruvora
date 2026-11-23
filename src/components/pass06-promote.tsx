"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Megaphone,
  Pin,
  QrCode,
  Rocket,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api, ruNumber } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { CreativeBrief, User } from "@/lib/types";
import {
  PROMOTABLE_CHANNELS,
  SOCIAL_CHANNEL_META,
  buildExternalShareIntents,
  buildSocialPostTemplate,
  channelLabel,
  type SocialChannel,
} from "@/lib/social-channels";
import { Empty, Eyebrow, Loading, Notice } from "./ui";
import { PageTitle, Stat } from "./workspace-ui";
import { PromoQrBox } from "./pass04-creator";
import {
  SocialPostPlannerPanel,
  StreakBadgesMilestonePanel,
  VanityLinkCard,
  type CreatorPostPlanItem,
  type CreatorRetentionData,
} from "./pass08-retention";

interface PromoteCampaignItem {
  id: string;
  name: string;
  description: string;
  objective: string;
  deliveryMode: string;
  creativeBrief: CreativeBrief | null;
  canParticipate: boolean;
  isDemo: boolean;
  promoCode: { code: string; discountLabel: string; usesCount: number } | null;
  showcaseItem: { id: string; collectionName: string; creatorNote: string } | null;
}

interface PromoteShareLink {
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
  createdAt: string;
}

interface ShowcaseEntry {
  id: string;
  campaignId: string;
  collectionName: string;
  creatorNote: string;
  sortOrder: number;
  campaign: {
    id: string;
    name: string;
    description: string;
    objective: string;
    state: string;
  };
  promoCode: string | null;
}

interface ChannelMetric {
  channel: string;
  visits: number;
  sessions: number;
  registrations: number;
  kitShares: number;
  validatedActions: number;
  conversionRatePct: number;
  creatorRuMicros: string;
}

export interface ReferralFunnelData {
  invitedCount: number;
  publishedProfiles: number;
  activeReferees: number;
  validatedCreditsCount: number;
  referralRuMicros: string;
  monthlyCapMicros: string;
  maxQualifiedReferees: number;
}

interface PromoteHubData {
  user: User;
  isCreatorEligible: boolean;
  canParticipate: boolean;
  followerThreshold: number;
  profileEntry: { slug: string; url: string; socialChannel: string } | null;
  referralEntry: { slug: string; url: string; socialChannel: string } | null;
  campaigns: PromoteCampaignItem[];
  shareLinks: PromoteShareLink[];
  showcase: ShowcaseEntry[];
  channelAnalytics: ChannelMetric[];
  referralFunnel: ReferralFunnelData;
  retention?: CreatorRetentionData;
  postPlans?: CreatorPostPlanItem[];
}

const PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "Snapchat",
  "WhatsApp",
  "Discord",
  "Threads",
  "LinkedIn",
] as const;

export function PromoteHubScreen({ onProfileUpdated }: { onProfileUpdated?: () => void }) {
  const { t, locale } = useLocale();
  const hubRes = useResource<PromoteHubData>("/promote/hub");
  const quickAction = useAction();
  const linkAction = useAction();
  const shareAction = useAction();
  const showcaseAction = useAction();

  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [target, setTarget] = useState<string>("PROFILE");
  const [channel, setChannel] = useState<SocialChannel>("INSTAGRAM_STORY");
  const [cardFormat, setCardFormat] = useState<"story" | "square" | "banner">("story");
  const [generatedUrls, setGeneratedUrls] = useState<Record<string, string>>({});
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);

  // Showcase form state
  const [pinCampaignId, setPinCampaignId] = useState<string>("");
  const [collectionName, setCollectionName] = useState(
    locale === "fr" ? "Mes Bons Plans" : "My Picks",
  );
  const [creatorNote, setCreatorNote] = useState("");

  const hub = hubRes.data;
  const deepLinkApplied = useRef(false);

  useEffect(() => {
    if (deepLinkApplied.current || !hub || typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("campaign");
    if (requested && hub.campaigns.some((c) => c.id === requested)) {
      deepLinkApplied.current = true;
      queueMicrotask(() => setTarget(`CAMPAIGN:${requested}`));
    }
  }, [hub]);

  const wizardOpen = useMemo(() => {
    if (showWizard !== null) return showWizard;
    if (!hub) return false;
    return !hub.isCreatorEligible || !hub.user.handle;
  }, [showWizard, hub]);

  const activeCampaign = useMemo(() => {
    if (!hub || !target.startsWith("CAMPAIGN:")) return null;
    const id = target.slice("CAMPAIGN:".length);
    return hub.campaigns.find((c) => c.id === id) ?? null;
  }, [hub, target]);

  const activeLinkKey = `${target}::${channel}`;

  const activeShareLinkObj = useMemo(() => {
    if (!hub) return null;
    if (target === "PROFILE") {
      return (
        hub.shareLinks.find((l) => l.source === "CREATOR_PROFILE" && l.socialChannel === channel) ??
        hub.shareLinks.find((l) => l.source === "CREATOR_PROFILE") ??
        null
      );
    }
    if (target === "REFERRAL") {
      return (
        hub.shareLinks.find((l) => l.source === "REFERRAL" && l.socialChannel === channel) ??
        hub.shareLinks.find((l) => l.source === "REFERRAL") ??
        null
      );
    }
    if (activeCampaign) {
      return (
        hub.shareLinks.find(
          (l) => l.campaignId === activeCampaign.id && l.socialChannel === channel,
        ) ??
        hub.shareLinks.find((l) => l.campaignId === activeCampaign.id) ??
        null
      );
    }
    return null;
  }, [hub, target, channel, activeCampaign]);

  const resolvedRelativeUrl = useMemo(() => {
    if (generatedUrls[activeLinkKey]) return generatedUrls[activeLinkKey]!;
    if (!hub) return "";
    if (activeShareLinkObj) {
      return activeShareLinkObj.customUrl || activeShareLinkObj.url;
    }
    if (target === "PROFILE") {
      return hub.profileEntry?.url ?? (hub.user.handle ? `/@${hub.user.handle}` : "");
    }
    if (target === "REFERRAL") {
      return hub.referralEntry?.url ?? "";
    }
    return "";
  }, [generatedUrls, activeLinkKey, hub, target, activeShareLinkObj]);

  const absoluteShareUrl = useMemo(() => {
    if (!resolvedRelativeUrl) return "";
    if (typeof window === "undefined") return resolvedRelativeUrl;
    return new URL(resolvedRelativeUrl, window.location.origin).href;
  }, [resolvedRelativeUrl]);

  const template = useMemo(() => {
    const fallbackUrl =
      absoluteShareUrl ||
      (hub?.user.handle && typeof window !== "undefined"
        ? `${window.location.origin}/@${hub.user.handle}`
        : "https://ruvora.app");
    if (target === "REFERRAL") {
      return buildSocialPostTemplate({
        kind: "REFERRAL",
        locale,
        channel,
        url: fallbackUrl,
        creatorHandle: hub?.user.handle,
      });
    }
    if (activeCampaign) {
      return buildSocialPostTemplate({
        kind: "CAMPAIGN",
        locale,
        channel,
        url: fallbackUrl,
        creatorHandle: hub?.user.handle,
        campaignName: activeCampaign.name,
        campaignDescription: activeCampaign.description,
        headline: activeCampaign.creativeBrief?.headline,
        talkingPoints: activeCampaign.creativeBrief?.talkingPoints,
        hashtags: activeCampaign.creativeBrief?.hashtags,
        cta: activeCampaign.creativeBrief?.cta,
        disclosureNote: activeCampaign.creativeBrief?.disclosureNote,
        suggestedHooks: activeCampaign.creativeBrief?.suggestedHooks,
        promoCode: activeCampaign.promoCode?.code ?? null,
        discountLabel: activeCampaign.promoCode?.discountLabel ?? null,
      });
    }
    return buildSocialPostTemplate({
      kind: "PROFILE",
      locale,
      channel,
      url: fallbackUrl,
      creatorHandle: hub?.user.handle,
    });
  }, [absoluteShareUrl, hub, target, activeCampaign, locale, channel]);

  const cardPreviewUrl = useMemo(() => {
    if (!hub?.user.handle) return null;
    const h = encodeURIComponent(hub.user.handle);
    if (target === "REFERRAL") {
      return `/share-card/referral/${h}?format=${cardFormat}&lang=${locale}`;
    }
    if (activeCampaign) {
      return `/share-card/promo/${h}?campaign=${encodeURIComponent(activeCampaign.id)}&format=${cardFormat}&lang=${locale}`;
    }
    return `/share-card/profile/${h}?format=${cardFormat}&lang=${locale}`;
  }, [hub, target, activeCampaign, cardFormat, locale]);

  if (hubRes.loading) return <Loading />;
  if (hubRes.error || !hub) {
    return (
      <>
        <Notice error message={t("unavailable")} />
        <button type="button" className="button button-small" onClick={hubRes.reload}>
          {t("retry")}
        </button>
      </>
    );
  }

  function flashCopy(key: string) {
    setCopiedFlag(key);
    setTimeout(() => setCopiedFlag((cur) => (cur === key ? null : cur)), 2000);
  }

  function toggleQuickCampaign(id: string) {
    setSelectedCampaignIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 3 ? [...cur, id] : cur,
    );
  }

  async function submitQuickStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const out = await quickAction.run(
      () =>
        api("/promote/quickstart", {
          handle: String(f.get("handle") || "")
            .trim()
            .toLowerCase(),
          displayName: String(f.get("displayName") || "").trim(),
          bio: String(f.get("bio") || "").trim(),
          category: String(f.get("category") || "Creator").trim(),
          country: String(f.get("country") || "FR")
            .trim()
            .toUpperCase(),
          city: String(f.get("city") || "").trim() || undefined,
          primaryPlatform: String(f.get("primaryPlatform") || "Instagram"),
          primarySocialUrl: String(f.get("primarySocialUrl") || "").trim(),
          followers: Number(f.get("followers") || 0),
          campaignIds: selectedCampaignIds,
          collectionName: String(
            f.get("collectionName") || (locale === "fr" ? "Mes Bons Plans" : "My Picks"),
          ).trim(),
          ageEligible: true,
          termsAccepted: true,
        }),
      t("p6QuickStartDone"),
    );
    if (out) {
      setShowWizard(false);
      await hubRes.reload();
      onProfileUpdated?.();
    }
  }

  async function ensureChannelLink() {
    const payload =
      target === "PROFILE"
        ? { surface: "PROFILE", socialChannel: channel }
        : target === "REFERRAL"
          ? { surface: "REFERRAL", socialChannel: channel }
          : {
              surface: "CAMPAIGN",
              targetId: activeCampaign?.id,
              socialChannel: channel,
            };
    const res = await linkAction.run(
      () => api<{ url: string; slug: string; socialChannel: string }>("/shares", payload),
      t("p6LinkReady"),
    );
    if (res?.url) {
      setGeneratedUrls((prev) => ({ ...prev, [activeLinkKey]: res.url }));
      await hubRes.reload();
    }
    return res?.url ?? resolvedRelativeUrl;
  }

  async function recordTelemetry() {
    const surface =
      target === "PROFILE" ? "PROFILE" : target === "REFERRAL" ? "REFERRAL" : "CAMPAIGN";
    await shareAction.run(
      () =>
        api("/promote/track-share", {
          socialChannel: channel,
          surface,
          ...(activeCampaign ? { campaignId: activeCampaign.id } : {}),
        }),
      t("p6ShareRecorded"),
    );
    await hubRes.reload();
  }

  async function handleCopyPost() {
    await navigator.clipboard.writeText(template.caption);
    flashCopy("post");
    await recordTelemetry();
  }

  async function handleCopyLink() {
    const rel = resolvedRelativeUrl || (await ensureChannelLink());
    if (!rel) return;
    const abs = new URL(rel, window.location.origin).href;
    await navigator.clipboard.writeText(abs);
    flashCopy("link");
    await recordTelemetry();
  }

  async function handleNativeShare() {
    const rel = resolvedRelativeUrl || (await ensureChannelLink());
    if (!rel) return;
    const abs = new URL(rel, window.location.origin).href;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: activeCampaign?.name ?? hub?.user.displayName ?? "Ruvora",
          text: template.caption,
          url: abs,
        });
        await recordTelemetry();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(`${template.caption}\n${abs}`);
          flashCopy("post");
        }
      }
    } else {
      await navigator.clipboard.writeText(template.caption);
      flashCopy("post");
      await recordTelemetry();
    }
  }

  async function submitShowcase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cid = pinCampaignId || hub?.campaigns[0]?.id;
    if (!cid) return;
    const res = await showcaseAction.run(
      () =>
        api("/promote/showcase", {
          campaignId: cid,
          collectionName:
            collectionName.trim() || (locale === "fr" ? "Mes Bons Plans" : "My Picks"),
          creatorNote: creatorNote.trim(),
        }),
      t("p6ShowcasePinned"),
    );
    if (res) {
      setCreatorNote("");
      await hubRes.reload();
    }
  }

  async function handleRemoveShowcase(campaignId: string) {
    const res = await showcaseAction.run(
      () => api("/promote/showcase/remove", { campaignId }),
      t("p6ShowcaseRemoved"),
    );
    if (res) await hubRes.reload();
  }

  const intents = buildExternalShareIntents(
    absoluteShareUrl ||
      (typeof window !== "undefined" ? window.location.origin : "https://ruvora.app"),
    template.hook,
  );
  const maxChannelVisits = Math.max(1, ...hub.channelAnalytics.map((c) => c.visits));

  return (
    <div className="promote-stack">
      <PageTitle title={t("p6PromoteTitle")} description={t("p6PromoteIntro")}>
        <div className="form-actions">
          <button
            type="button"
            className="button button-small button-secondary"
            onClick={() => setShowWizard(!wizardOpen)}
          >
            <Rocket size={15} />
            {t(wizardOpen ? "p6QuickStartHideWizard" : "p6QuickStartOpenWizard")}
          </button>
          {hub.user.handle && (
            <Link href={`/@${hub.user.handle}`} className="button button-small">
              {t("openProfile")}
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      </PageTitle>

      {quickAction.notice && !wizardOpen && (
        <Notice message={quickAction.notice} error={quickAction.failed} />
      )}

      {/* 1. 60-Second Express Promoter Wizard */}
      {wizardOpen && (
        <section className="panel promote-quickstart">
          <div className="panel-header">
            <div>
              <Eyebrow>{t("p6QuickStartEyebrow")}</Eyebrow>
              <h2>{t("p6QuickStartTitle")}</h2>
              <p className="panel-description">{t("p6QuickStartSubtitle")}</p>
            </div>
          </div>
          <form onSubmit={submitQuickStart} className="form-stack">
            <p className="field-section-title">{t("p6QuickStartStep1")}</p>
            <div className="form-grid">
              <label className="field">
                {t("handle")}
                <input
                  name="handle"
                  defaultValue={hub.user.handle ?? ""}
                  pattern="[a-z0-9_]{3,24}"
                  placeholder="mon_pseudo"
                  required
                />
              </label>
              <label className="field">
                {t("name")}
                <input
                  name="displayName"
                  defaultValue={hub.user.displayName}
                  minLength={2}
                  maxLength={60}
                  required
                />
              </label>
              <label className="field">
                {t("category")}
                <input
                  name="category"
                  defaultValue={hub.user.category ?? "Lifestyle"}
                  minLength={2}
                  maxLength={40}
                  required
                />
              </label>
              <label className="field">
                {t("country")}
                <input
                  name="country"
                  defaultValue={hub.user.country ?? "FR"}
                  pattern="[A-Z]{2}"
                  maxLength={2}
                  required
                />
              </label>
              <label className="field">
                {t("p4CityLabel")}
                <input name="city" defaultValue={hub.user.city ?? ""} maxLength={60} />
              </label>
              <label className="field">
                {t("p6QuickStartPrimaryPlatform")}
                <select
                  name="primaryPlatform"
                  defaultValue={hub.user.socialLinks?.[0]?.platform ?? "Instagram"}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("p6QuickStartProfileUrl")}
                <input
                  name="primarySocialUrl"
                  type="url"
                  pattern="https://.*"
                  defaultValue={hub.user.socialLinks?.[0]?.url ?? "https://instagram.com/"}
                  required
                />
              </label>
              <label className="field">
                {t("p6QuickStartFollowers")}
                <input
                  name="followers"
                  type="number"
                  min={0}
                  max={1000000000}
                  defaultValue={Math.max(hub.user.followers || 0, 10)}
                  required
                />
              </label>
              <label className="field full-width">
                {t("bio")}
                <input name="bio" defaultValue={hub.user.bio ?? ""} maxLength={300} />
              </label>
            </div>

            <p className="field-section-title">{t("p6QuickStartStep2")}</p>
            {hub.campaigns.length ? (
              <div className="promote-campaign-picks">
                {hub.campaigns.slice(0, 6).map((c) => {
                  const picked = selectedCampaignIds.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggleQuickCampaign(c.id)}
                      className={`chip-toggle ${picked ? "chip-active" : ""}`}
                      aria-pressed={picked}
                    >
                      {picked ? <Check size={14} /> : <Sparkles size={14} />}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="field-hint">{t("p6QuickStartNoCampaigns")}</p>
            )}

            <label className="field">
              {t("p6ShowcaseCollection")}
              <input
                name="collectionName"
                defaultValue={locale === "fr" ? "Mes Bons Plans" : "My Picks"}
                maxLength={50}
              />
            </label>

            <label className="checkbox-row">
              <input type="checkbox" defaultChecked required />
              <span>{t("p6QuickStartAgeTerms")}</span>
            </label>

            <div className="form-actions">
              <button type="submit" className="button button-small" disabled={quickAction.busy}>
                <Rocket size={15} />
                {t(quickAction.busy ? "working" : "p6QuickStartSubmit")}
              </button>
            </div>
            {quickAction.notice && (
              <Notice message={quickAction.notice} error={quickAction.failed} />
            )}
          </form>
        </section>
      )}

      {/* 2. Social Kit & Multi-Network Link Studio */}
      <section className="panel promote-studio">
        <div className="panel-header">
          <div>
            <Eyebrow>{t("p6NavPromote")}</Eyebrow>
            <h2>{t("p6StudioTitle")}</h2>
            <p className="panel-description">{t("p6StudioSubtitle")}</p>
          </div>
          <span className="tag">
            <Megaphone size={13} /> {channelLabel(channel, locale)}
          </span>
        </div>

        <div className="form-grid">
          <label className="field full-width">
            {t("p6TargetLabel")}
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label={t("p6TargetLabel")}
            >
              {hub.user.handle && <option value="PROFILE">{t("p6TargetProfile")}</option>}
              <option value="REFERRAL">{t("p6TargetReferral")}</option>
              {hub.campaigns.map((c) => (
                <option key={c.id} value={`CAMPAIGN:${c.id}`}>
                  {t("p6TargetCampaignPrefix")}: {c.name}
                  {c.promoCode ? ` (${c.promoCode.code})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="promote-channel-strip" role="group" aria-label={t("p6ChannelLabel")}>
          {PROMOTABLE_CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setChannel(ch);
                setCardFormat(SOCIAL_CHANNEL_META[ch].recommendedFormat);
              }}
              className={`chip-toggle ${channel === ch ? "chip-active" : ""}`}
              aria-pressed={channel === ch}
            >
              {channelLabel(ch, locale)}
            </button>
          ))}
        </div>

        <div className="promote-link-bar">
          <div className="promote-link-display">
            <small>
              {t("p6ActiveChannelLink")} <strong>{channelLabel(channel, locale)}</strong>
            </small>
            <code>{absoluteShareUrl || t("p6GenerateLinkBtn")}</code>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button button-small"
              disabled={linkAction.busy}
              onClick={() => void ensureChannelLink()}
            >
              {t(linkAction.busy ? "working" : "p6GenerateLinkBtn")}
            </button>
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => void handleCopyLink()}
            >
              {copiedFlag === "link" ? <Check size={14} /> : <Copy size={14} />}
              {t(copiedFlag === "link" ? "p6LinkCopied" : "p6CopyLinkBtn")}
            </button>
          </div>
        </div>
        {linkAction.notice && <Notice message={linkAction.notice} error={linkAction.failed} />}

        {/* Advertiser Media Kit callout when promoting a campaign with brief */}
        {activeCampaign?.creativeBrief && (
          <div className="promote-mediakit-box">
            <strong>{t("p6MediaKitTitle")}</strong>
            {activeCampaign.creativeBrief.headline && (
              <p>{activeCampaign.creativeBrief.headline}</p>
            )}
            {activeCampaign.creativeBrief.suggestedHooks &&
              activeCampaign.creativeBrief.suggestedHooks.length > 0 && (
                <div>
                  <small>{t("p6MediaKitHooks")}:</small>
                  <ul>
                    {activeCampaign.creativeBrief.suggestedHooks.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            {activeCampaign.creativeBrief.disclosureNote && (
              <p className="field-hint">
                {t("p6MediaKitDisclosure")}:{" "}
                <code>{activeCampaign.creativeBrief.disclosureNote}</code>
              </p>
            )}
            <div className="form-actions" style={{ marginTop: 10 }}>
              <a
                href={`/api/campaigns/${encodeURIComponent(activeCampaign.id)}/brief-pdf?lang=${locale}`}
                className="button button-small button-secondary"
                download
              >
                <Download size={14} />
                {t("p8OfferDownloadBriefPdf")}
              </a>
              <Link
                href={`/offers/${encodeURIComponent(activeCampaign.id)}`}
                className="button button-small button-secondary"
              >
                {t("p8OfferViewDetails")}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Ready-to-post copy & 1-click social shortcuts */}
        <div className="promote-kit-grid">
          <div className="promote-caption-col">
            <div className="promote-caption-header">
              <label htmlFor="promote-caption-text">{t("p6PostPreviewLabel")}</label>
              <span className="tag">{t("p6DisclosureBadge")}</span>
            </div>
            <textarea
              id="promote-caption-text"
              readOnly
              rows={7}
              value={template.caption}
              className="promote-caption-textarea"
            />
            <div className="form-actions">
              <button
                type="button"
                className="button button-small"
                onClick={() => void handleCopyPost()}
              >
                {copiedFlag === "post" ? <Check size={14} /> : <Copy size={14} />}
                {t(copiedFlag === "post" ? "p6PostCopied" : "p6CopyPostBtn")}
              </button>
              <button
                type="button"
                className="button button-small button-secondary"
                onClick={() => void handleNativeShare()}
              >
                <Share2 size={14} />
                {t("p6NativeShareBtn")}
              </button>
            </div>
            <div className="promote-intents">
              <small>{t("p6QuickShareTitle")}:</small>
              <div className="form-actions">
                <a
                  className="text-link"
                  href={intents.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void recordTelemetry()}
                >
                  WhatsApp <ExternalLink size={12} />
                </a>
                <a
                  className="text-link"
                  href={intents.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void recordTelemetry()}
                >
                  X <ExternalLink size={12} />
                </a>
                <a
                  className="text-link"
                  href={intents.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void recordTelemetry()}
                >
                  Telegram <ExternalLink size={12} />
                </a>
                <a
                  className="text-link"
                  href={intents.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void recordTelemetry()}
                >
                  LinkedIn <ExternalLink size={12} />
                </a>
                <a
                  className="text-link"
                  href={intents.email}
                  onClick={() => void recordTelemetry()}
                >
                  Email <ExternalLink size={12} />
                </a>
              </div>
            </div>
            {shareAction.notice && (
              <Notice message={shareAction.notice} error={shareAction.failed} />
            )}
          </div>

          <div className="promote-qr-col">
            <div className="promote-qr-header">
              <QrCode size={15} />
              <strong>{t("p6QrQuickLabel")}</strong>
            </div>
            {absoluteShareUrl ? (
              <PromoQrBox url={absoluteShareUrl} label={channelLabel(channel, locale)} />
            ) : (
              <p className="field-hint">{t("p6GenerateLinkBtn")}</p>
            )}
          </div>
        </div>
      </section>

      {/* 3. Downloadable Multi-Format Visual Cards (9:16 / 1:1 / 16:9) */}
      {cardPreviewUrl && (
        <section className="panel promote-visuals">
          <div className="panel-header">
            <div>
              <h2>{t("p6VisualsTitle")}</h2>
              <p className="panel-description">{t("p6VisualsSubtitle")}</p>
            </div>
            <div className="form-actions">
              {(
                [
                  ["story", "p6FormatStory"],
                  ["square", "p6FormatSquare"],
                  ["banner", "p6FormatBanner"],
                ] as const
              ).map(([fmt, labelKey]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setCardFormat(fmt)}
                  className={`chip-toggle ${cardFormat === fmt ? "chip-active" : ""}`}
                  aria-pressed={cardFormat === fmt}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="promote-card-preview-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- Live dynamic server-rendered PNG card */}
            <img
              src={cardPreviewUrl}
              alt={t("p6VisualsTitle")}
              className={`promote-card-img promote-card-img-${cardFormat}`}
            />
            <div className="form-actions">
              <a
                href={`${cardPreviewUrl}&download=1`}
                download
                className="button button-small"
                onClick={() => void recordTelemetry()}
              >
                <Download size={15} />
                {t("p6DownloadPng")}
              </a>
              <a
                href={cardPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-small button-secondary"
              >
                {t("p6OpenCardTab")}
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </section>
      )}

      {/* 4. Curated Public Showcase ("Mes Bons Plans" on /@handle) */}
      {hub.isCreatorEligible && (
        <section className="panel promote-showcase">
          <div className="panel-header">
            <div>
              <h2>{t("p6ShowcaseTitle")}</h2>
              <p className="panel-description">{t("p6ShowcaseSubtitle")}</p>
            </div>
            {hub.user.handle && (
              <Link href={`/@${hub.user.handle}`} className="text-link">
                /@{hub.user.handle} <ArrowUpRight size={14} />
              </Link>
            )}
          </div>

          {hub.campaigns.length > 0 && (
            <form onSubmit={submitShowcase} className="form-stack">
              <div className="form-grid">
                <label className="field">
                  {t("p6TargetCampaignPrefix")}
                  <select
                    value={pinCampaignId || hub.campaigns[0]?.id || ""}
                    onChange={(e) => setPinCampaignId(e.target.value)}
                  >
                    {hub.campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t("p6ShowcaseCollection")}
                  <input
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </label>
                <label className="field full-width">
                  {t("p6ShowcaseNote")}
                  <input
                    value={creatorNote}
                    onChange={(e) => setCreatorNote(e.target.value)}
                    maxLength={220}
                    placeholder={
                      locale === "fr"
                        ? "Ex: Je l'utilise au quotidien — super qualité et livraison rapide."
                        : "e.g. I use this daily — great quality and quick setup."
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="submit"
                  className="button button-small"
                  disabled={showcaseAction.busy}
                >
                  <Pin size={14} />
                  {t(showcaseAction.busy ? "working" : "p6ShowcasePinBtn")}
                </button>
              </div>
              {showcaseAction.notice && (
                <Notice message={showcaseAction.notice} error={showcaseAction.failed} />
              )}
            </form>
          )}

          {hub.showcase.length ? (
            <div className="promote-showcase-list">
              {hub.showcase.map((item) => (
                <article key={item.id} className="promote-showcase-row">
                  <div>
                    <span className="tag">{item.collectionName}</span>
                    <strong>{item.campaign.name}</strong>
                    {item.creatorNote && <p className="field-hint">{item.creatorNote}</p>}
                    {item.promoCode && (
                      <small>
                        {t("p4PromoCodeLabel")}: <code>{item.promoCode}</code>
                      </small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    disabled={showcaseAction.busy}
                    onClick={() => void handleRemoveShowcase(item.campaignId)}
                  >
                    <Trash2 size={14} />
                    {t("p6ShowcaseRemoveBtn")}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty>{t("p6ShowcaseEmpty")}</Empty>
          )}
        </section>
      )}

      {/* 5. Vanity Short Link & Mobile Smart Offer Bridge */}
      <VanityLinkCard
        link={activeShareLinkObj}
        origin={typeof window !== "undefined" ? window.location.origin : ""}
        onSaved={() => void hubRes.reload()}
      />

      {/* 6. Weekly Streak, Badges & Milestone PNG Cards (XP-Only) */}
      <StreakBadgesMilestonePanel retention={hub.retention} handle={hub.user.handle} />

      {/* 7. Social Content Planner & .ics Calendar Export */}
      <SocialPostPlannerPanel
        plans={hub.postPlans ?? []}
        campaigns={hub.campaigns.map((c) => ({ id: c.id, name: c.name }))}
        defaultCampaignId={activeCampaign?.id ?? ""}
        defaultChannel={channel}
        onChanged={() => void hubRes.reload()}
      />

      {/* 8. Performance by Social Network */}
      <section className="panel promote-channel-analytics">
        <div className="panel-header">
          <div>
            <h2>{t("p6ChannelAnalyticsTitle")}</h2>
            <p className="panel-description">{t("p6ChannelAnalyticsSubtitle")}</p>
          </div>
        </div>
        {hub.channelAnalytics.length === 0 ? (
          <Empty>{t("p6NoChannelData")}</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("p6ColChannel")}</th>
                  <th>{t("p6ColClicks")}</th>
                  <th>{t("p6ColSessions")}</th>
                  <th>{t("p6ColSignups")}</th>
                  <th>{t("p6ColValidated")}</th>
                  <th>{t("p6ColConv")}</th>
                  <th>{t("p6ColCreatorRu")}</th>
                </tr>
              </thead>
              <tbody>
                {hub.channelAnalytics.map((row) => (
                  <tr key={row.channel}>
                    <td>
                      <strong>{channelLabel(row.channel, locale)}</strong>
                      <div className="channel-mini-bar">
                        <span
                          style={{
                            width: `${Math.max(6, Math.round((row.visits / maxChannelVisits) * 100))}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="number">{row.visits}</td>
                    <td className="number">{row.sessions}</td>
                    <td className="number">{row.registrations}</td>
                    <td className="number">{row.validatedActions}</td>
                    <td className="number">{row.conversionRatePct}%</td>
                    <td className="number">
                      {ruNumber(row.creatorRuMicros, locale)} {t("ruUnit")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Upgraded viral direct-referral kit + transparent funnel rendered inside /app/referrals.
 */
export function ReferralViralKitPanel({ handle }: { handle: string | null }) {
  const { t, locale } = useLocale();
  const funnelRes = useResource<ReferralFunnelData>("/referrals/funnel");
  const shareAction = useAction();
  const [copied, setCopied] = useState(false);

  const f = funnelRes.data;
  const referralUrl =
    typeof window !== "undefined" && handle
      ? `${window.location.origin}/r/${handle}`
      : handle
        ? `/r/${handle}`
        : "";

  const storyUrl = handle
    ? `/share-card/referral/${encodeURIComponent(handle)}?format=story&lang=${locale}`
    : null;

  const inviteTemplate = buildSocialPostTemplate({
    kind: "REFERRAL",
    locale,
    channel: "WHATSAPP",
    url: referralUrl || "https://ruvora.app",
    creatorHandle: handle,
  });

  async function copyInviteMessage() {
    await navigator.clipboard.writeText(inviteTemplate.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await shareAction.run(() =>
      api("/promote/track-share", { socialChannel: "WHATSAPP", surface: "REFERRAL" }),
    );
  }

  return (
    <div className="promote-stack" style={{ marginTop: 20 }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{t("p6ReferralFunnelTitle")}</h2>
            <p className="panel-description">{t("p6ReferralFunnelNote")}</p>
          </div>
          <Link href="/app/promote" className="button button-small button-secondary">
            <Megaphone size={14} />
            {t("p6NavPromote")}
          </Link>
        </div>
        {funnelRes.loading ? (
          <Loading />
        ) : f ? (
          <div className="stats-grid">
            <Stat label={t("p6FunnelInvited")} value={f.invitedCount} />
            <Stat label={t("p6FunnelProfiles")} value={f.publishedProfiles} />
            <Stat label={t("p6FunnelActive")} value={f.activeReferees} />
            <Stat label={t("p6FunnelCredits")} value={f.validatedCreditsCount} />
          </div>
        ) : null}
      </section>

      {storyUrl && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{t("p6ReferralStoryTitle")}</h2>
              <p className="panel-description">{t("p6ReferralStoryDesc")}</p>
            </div>
          </div>
          <div className="promote-kit-grid">
            <div className="promote-caption-col">
              <textarea
                readOnly
                rows={5}
                value={inviteTemplate.caption}
                className="promote-caption-textarea"
                aria-label={t("p6ReferralStoryTitle")}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => void copyInviteMessage()}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {t(copied ? "p6PostCopied" : "p6CopyPostBtn")}
                </button>
                <a
                  href={`${storyUrl}&download=1`}
                  download
                  className="button button-small button-secondary"
                >
                  <Download size={14} />
                  {t("p6DownloadPng")} (9:16)
                </a>
              </div>
            </div>
            <div className="promote-qr-col">
              {/* eslint-disable-next-line @next/next/no-img-element -- Live referral story PNG */}
              <img
                src={storyUrl}
                alt={t("p6ReferralStoryTitle")}
                className="promote-card-img promote-card-img-story"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
