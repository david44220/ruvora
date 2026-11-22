"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  Plus,
  ArrowUpRight,
  Layers3,
  Aperture,
  CircleDollarSign,
  Check,
  Sparkles,
  Tag,
  Copy,
  QrCode,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/i18n/provider";
import { type MessageKey } from "@/i18n/messages";
import { api, minorMoney, ruNumber } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { type Campaign, type Dashboard } from "@/lib/types";
import { Notice, Status, Empty, Loading } from "./ui";
import { PageTitle, Stat } from "./workspace-ui";
import { AdvertiserAnalytics, TrackedShare } from "./growth";
import type { ManagedEvent } from "./event-studio";
import { useDashboard } from "./app-context";
import { AdvertiserIntegrationsHub, WorkspaceTeamPanel } from "./pass04-advertiser";
import { PromoQrBox } from "./pass04-creator";

const TARGET_PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitch", "X", "Discord"] as const;

interface AudienceEstimate {
  matchingCreators: number;
  verifiedCreators: number;
  matchingParticipants: number;
  totalFollowersReach: number;
  estimatedMaxActions: number | null;
}

export function CampaignForm({ onCreated }: { onCreated: () => void }) {
  const { t, locale } = useLocale();
  const action = useAction();
  const estimateAction = useAction();
  const events = useResource<{ events: ManagedEvent[] }>("/events/manage");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [budgetVal, setBudgetVal] = useState("");
  const [dailyVal, setDailyVal] = useState("");
  const [unitVal, setUnitVal] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<AudienceEstimate | null>(null);

  const previewEur = (raw: string) => {
    if (!/^\d+$/.test(raw.trim())) return null;
    try {
      return `${t("p2FormattedAmount")}: ${minorMoney(raw.trim(), locale)}`;
    } catch {
      return null;
    }
  };

  function togglePlatform(p: string) {
    setSelectedPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function parseTargeting(f: FormData) {
    const maxRaw = String(f.get("maximumCreatorFollowers") || "").trim();
    return {
      allowedCountries: String(f.get("allowedCountries") || "")
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v) => /^[A-Z]{2}$/.test(v)),
      allowedCities: String(f.get("allowedCities") || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      allowedLanguages: String(f.get("allowedLanguages") || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter((v): v is "fr" | "en" | "es" | "de" | "it" | "pt" =>
          ["fr", "en", "es", "de", "it", "pt"].includes(v),
        ),
      allowedPlatforms: selectedPlatforms,
      creatorCategories: String(f.get("creatorCategories") || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      minimumCreatorFollowers: Number(f.get("minimumCreatorFollowers") || 0),
      maximumCreatorFollowers: maxRaw ? Number(maxRaw) : null,
      requireVerifiedAudience: f.get("requireVerifiedAudience") === "on",
      minimumReliabilityScore: Number(f.get("minimumReliabilityScore") || 0),
    };
  }

  async function runEstimate() {
    if (!formRef.current) return;
    const f = new FormData(formRef.current);
    const targeting = parseTargeting(f);
    const out = await estimateAction.run(() =>
      api<AudienceEstimate>("/campaigns/estimate", {
        ...targeting,
        ...(/^\d+$/.test(budgetVal.trim()) && Number(budgetVal) > 0
          ? { budgetMinor: budgetVal.trim() }
          : {}),
        ...(/^\d+$/.test(unitVal.trim()) && Number(unitVal) > 0
          ? { unitCostMinor: unitVal.trim() }
          : {}),
      }),
    );
    if (out) setEstimate(out);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const targeting = parseTargeting(f);

    const headline = String(f.get("briefHeadline") || "").trim();
    const talkingPoints = String(f.get("briefTalkingPoints") || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const hashtags = String(f.get("briefHashtags") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cta = String(f.get("briefCta") || "").trim();
    const formatHint = String(f.get("briefFormat") || "").trim();
    const hasBrief = Boolean(
      headline || talkingPoints.length || hashtags.length || cta || formatHint,
    );

    const abVariants: { id: string; label: string; destinationUrl: string }[] = [];
    const varALabel = String(f.get("abVariantALabel") || "").trim();
    const varAUrl = String(f.get("abVariantAUrl") || "").trim();
    const varBLabel = String(f.get("abVariantBLabel") || "").trim();
    const varBUrl = String(f.get("abVariantBUrl") || "").trim();
    if (varALabel && varAUrl)
      abVariants.push({ id: "A", label: varALabel, destinationUrl: varAUrl });
    if (varBLabel && varBUrl)
      abVariants.push({ id: "B", label: varBLabel, destinationUrl: varBUrl });

    const result = await action.run(
      () =>
        api("/campaigns", {
          name: f.get("name"),
          description: String(f.get("description") || "").trim(),
          ...(f.get("eventId") ? { eventId: f.get("eventId") } : {}),
          ...targeting,
          deliveryMode: String(f.get("deliveryMode") || "OPEN"),
          ...(hasBrief
            ? {
                creativeBrief: {
                  headline,
                  talkingPoints,
                  hashtags,
                  cta,
                  formatHint,
                  assetUrls: [],
                },
              }
            : {}),
          ...(abVariants.length ? { abVariants } : {}),
          objective: f.get("objective"),
          destinationUrl: f.get("destinationUrl"),
          budgetMinor: f.get("budgetMinor"),
          dailyBudgetMinor: f.get("dailyBudgetMinor"),
          unitCostMinor: f.get("unitCostMinor"),
          startAt: new Date(String(f.get("startAt"))).toISOString(),
          endAt: new Date(String(f.get("endAt"))).toISOString(),
        }),
      t("campaignCreated"),
    );
    if (result) onCreated();
  }

  return (
    <section className="panel" style={{ marginBottom: 25 }}>
      <div className="panel-header">
        <h3>{t("createCampaign")}</h3>
      </div>
      <form ref={formRef} onSubmit={submit} className="form-stack">
        <div className="form-grid">
          <label className="field">
            {t("campaignName")}
            <input name="name" minLength={3} maxLength={80} required />
          </label>
          <label className="field">
            {t("objective")}
            <select name="objective">
              {(["CLICK", "QUALIFIED_VIEW", "CONVERSION", "SPONSORED_MISSION"] as const).map(
                (type) => (
                  <option value={type} key={type}>
                    {t(`objective${type}`)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field full-width">
            {t("destination")}
            <input name="destinationUrl" type="url" required pattern="https://.*" />
          </label>
          <label className="field">
            {t("budget")}
            <input
              name="budgetMinor"
              type="number"
              min="1"
              step="1"
              required
              onChange={(e) => setBudgetVal(e.target.value)}
            />
            {previewEur(budgetVal) && (
              <span className="money-preview">{previewEur(budgetVal)}</span>
            )}
          </label>
          <label className="field">
            {t("dailyBudget")}
            <input
              name="dailyBudgetMinor"
              type="number"
              min="1"
              step="1"
              required
              onChange={(e) => setDailyVal(e.target.value)}
            />
            {previewEur(dailyVal) && <span className="money-preview">{previewEur(dailyVal)}</span>}
          </label>
          <label className="field">
            {t("unitCost")}
            <input
              name="unitCostMinor"
              type="number"
              min="1"
              step="1"
              required
              onChange={(e) => setUnitVal(e.target.value)}
            />
            {previewEur(unitVal) && <span className="money-preview">{previewEur(unitVal)}</span>}
          </label>
          <label className="field">
            {t("p2LinkedCampaign")}
            <select name="eventId">
              <option value="">{t("p2NoLinkedCampaign")}</option>
              {events.data?.events
                .filter((e) => ["DRAFT", "PENDING_REVIEW", "ACTIVE", "SCHEDULED"].includes(e.state))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            {t("p4DeliveryMode")}
            <select name="deliveryMode" defaultValue="OPEN">
              <option value="OPEN">{t("p4ModeOPEN")}</option>
              <option value="UGC_BRIEF">{t("p4ModeUGC_BRIEF")}</option>
            </select>
          </label>
          <label className="field">
            {t("p2AllowedCountries")}
            <input name="allowedCountries" placeholder="FR, DE" maxLength={200} />
          </label>
          <label className="field">
            {t("p4AllowedCities")}
            <input name="allowedCities" placeholder="Paris, Lyon" maxLength={200} />
          </label>
          <label className="field">
            {t("p4AllowedLanguages")}
            <input name="allowedLanguages" placeholder="fr, en" maxLength={40} />
          </label>
          <label className="field">
            {t("p2Categories")}
            <input name="creatorCategories" maxLength={300} />
          </label>
          <label className="field">
            {t("p2MinimumFollowers")}
            <input name="minimumCreatorFollowers" type="number" min="0" step="1" defaultValue="0" />
          </label>
          <label className="field">
            {t("p4MaxFollowers")}
            <input
              name="maximumCreatorFollowers"
              type="number"
              min="0"
              step="1"
              placeholder="5000"
            />
          </label>
          <label className="field">
            {t("p4MinReliability")}
            <input
              name="minimumReliabilityScore"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue="0"
            />
          </label>
          <label className="field">
            {t("startDate")}
            <input name="startAt" type="datetime-local" required />
          </label>
          <label className="field">
            {t("endDate")}
            <input name="endAt" type="datetime-local" required />
          </label>
          <div className="field full-width">
            <span>{t("p4AllowedPlatforms")}</span>
            <div className="platform-chip-row">
              {TARGET_PLATFORMS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`tab-chip ${selectedPlatforms.includes(p) ? "active" : ""}`}
                  onClick={() => togglePlatform(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="field full-width">
            <label className="checkbox-field">
              <input name="requireVerifiedAudience" type="checkbox" />
              {t("p4RequireVerified")}
            </label>
          </div>
        </div>

        <div className="estimator-box">
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <div>
              <strong>{t("p4EstimatorTitle")}</strong>
            </div>
            <button
              type="button"
              className="button button-small button-secondary"
              disabled={estimateAction.busy}
              onClick={() => void runEstimate()}
            >
              <Users size={15} />
              {t("p4EstimatorRefresh")}
            </button>
          </div>
          {estimate && (
            <dl className="dist-summary-grid" style={{ margin: 0 }}>
              <div>
                <dt>{t("p4EstimatorCreators")}</dt>
                <dd>{estimate.matchingCreators}</dd>
              </div>
              <div>
                <dt>{t("p4EstimatorVerified")}</dt>
                <dd>{estimate.verifiedCreators}</dd>
              </div>
              <div>
                <dt>{t("p4EstimatorReach")}</dt>
                <dd>{estimate.totalFollowersReach.toLocaleString(locale)}</dd>
              </div>
              <div>
                <dt>{t("p4EstimatorMaxActions")}</dt>
                <dd>{estimate.estimatedMaxActions ?? "—"}</dd>
              </div>
            </dl>
          )}
        </div>

        <details className="optional-section">
          <summary>{t("p4CreativeBriefSection")}</summary>
          <div className="form-grid" style={{ marginTop: 14 }}>
            <label className="field full-width">
              {t("p4BriefHeadline")}
              <input name="briefHeadline" maxLength={120} />
            </label>
            <label className="field full-width">
              {t("p4BriefTalkingPoints")}
              <textarea name="briefTalkingPoints" rows={3} />
            </label>
            <label className="field">
              {t("p4BriefHashtags")}
              <input name="briefHashtags" placeholder="#Ruvora, #Design" maxLength={160} />
            </label>
            <label className="field">
              {t("p4BriefCta")}
              <input name="briefCta" maxLength={80} />
            </label>
            <label className="field full-width">
              {t("p4BriefFormat")}
              <input name="briefFormat" maxLength={80} placeholder="Reel 20s / Story / Short" />
            </label>
          </div>
        </details>

        <details className="optional-section">
          <summary>{t("p4AbSection")}</summary>
          <div className="form-grid" style={{ marginTop: 14 }}>
            <label className="field">
              {t("p4AbVariantALabel")}
              <input name="abVariantALabel" maxLength={60} placeholder="Landing A" />
            </label>
            <label className="field">
              {t("p4AbVariantAUrl")}
              <input name="abVariantAUrl" type="url" pattern="https://.*" />
            </label>
            <label className="field">
              {t("p4AbVariantBLabel")}
              <input name="abVariantBLabel" maxLength={60} placeholder="Landing B" />
            </label>
            <label className="field">
              {t("p4AbVariantBUrl")}
              <input name="abVariantBUrl" type="url" pattern="https://.*" />
            </label>
          </div>
        </details>

        {action.notice && <Notice message={action.notice} error={action.failed} />}
        <div>
          <button className="button" disabled={action.busy}>
            {t(action.busy ? "working" : "submitDraft")}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}
function CampaignCard({
  campaign,
  fundingEnabled,
  reload,
}: {
  campaign: Campaign;
  fundingEnabled: boolean;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const key = useRef<string | null>(null);
  const funded = BigInt(campaign.remainingMinor || 0) > 0n;
  async function fund(source: "DEVELOPMENT" | "AVAILABLE" = "DEVELOPMENT") {
    key.current ??= crypto.randomUUID();
    const result = await action.run(
      () =>
        api(`/campaigns/${campaign.id}/fund`, {
          source,
          amountMinor: campaign.budgetMinor,
          idempotencyKey: key.current,
        }),
      t("campaignFunded"),
    );
    if (result) await reload();
  }
  async function review() {
    const result = await action.run(
      () => api(`/campaigns/${campaign.id}/submit`, {}),
      t("campaignSubmitted"),
    );
    if (result) await reload();
  }
  async function transition(next: "PAUSE" | "RESUME") {
    const result = await action.run(
      () => api(`/campaigns/${campaign.id}/transition`, { action: next }),
      t(next === "PAUSE" ? "p2CampaignPaused" : "p2CampaignResumed"),
    );
    if (result) await reload();
  }
  return (
    <article className="campaign-card">
      <div className="panel-header">
        <div className="profile-badge-row" style={{ margin: 0 }}>
          <span className="tag">
            {t(`objective${campaign.objective}` as MessageKey) || campaign.objective}
          </span>
          {campaign.deliveryMode === "UGC_BRIEF" && <span className="tag">UGC</span>}
        </div>
        <Status value={campaign.state} />
      </div>
      <h3>{campaign.name}</h3>
      <a
        className="text-link"
        href={campaign.destinationUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("visitDestination")}
        <ArrowUpRight size={15} />
      </a>
      <div className="campaign-facts">
        <div>
          <small>{t("totalBudget")}</small>
          <strong>{minorMoney(campaign.budgetMinor, locale)}</strong>
        </div>
        <div>
          <small>{t("validatedCount")}</small>
          <strong>{campaign.validatedCount || 0}</strong>
        </div>
      </div>
      {campaign.isDemo && (
        <p className="field-hint" style={{ marginTop: 17 }}>
          {t("demoFundsNote")}
        </p>
      )}
      {["DRAFT", "REJECTED"].includes(campaign.state) && (
        <div className="form-actions">
          {!funded && (
            <button
              className="button button-secondary"
              onClick={() => fund("AVAILABLE")}
              disabled={action.busy}
            >
              {t("p2FundMedia")}
            </button>
          )}
          {!funded && fundingEnabled && (
            <button
              className="button button-secondary"
              onClick={() => fund()}
              disabled={action.busy}
            >
              {t(action.busy ? "working" : "fundDemo")}
            </button>
          )}
          {funded && (
            <button className="button" onClick={review} disabled={action.busy}>
              {t(action.busy ? "working" : "submitReview")}
            </button>
          )}
          {!funded && !fundingEnabled && (
            <p className="field-hint">{t("campaignFundingUnavailable")}</p>
          )}
        </div>
      )}
      {campaign.state === "ACTIVE" && (
        <div className="form-actions">
          <button
            className="button button-small button-secondary"
            onClick={() => transition("PAUSE")}
            disabled={action.busy}
          >
            {t(action.busy ? "working" : "p2PauseCampaign")}
          </button>
        </div>
      )}
      {campaign.state === "PAUSED" && (
        <div className="form-actions">
          <button
            className="button button-small"
            onClick={() => transition("RESUME")}
            disabled={action.busy}
          >
            {t(action.busy ? "working" : "p2ResumeCampaign")}
          </button>
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function AdvertiserScreen({
  data,
  reload,
}: {
  data: Dashboard;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const [creating, setCreating] = useState(false);
  const ru = data.rewardUnits
    .filter((r) => r.category === "ADVERTISER" && r.state === "VALIDATED")
    .reduce((sum, r) => sum + BigInt(r._sum.amountMicros), 0n);
  return (
    <>
      <PageTitle title={t("campaignManager")} description={t("advertiserIntro")}>
        <button className="button button-small" onClick={() => setCreating(!creating)}>
          {t(creating ? "close" : "createCampaign")}
          <Plus size={16} />
        </button>
      </PageTitle>
      <div className="stats-grid advertiser-stats">
        <Stat label={t("campaigns")} value={data.campaigns.length} icon={<Aperture />} />
        <Stat
          label={t("advertiserRU")}
          value={ruNumber(ru, locale)}
          hint={t("noCashValue")}
          icon={<Layers3 />}
        />
        <Stat
          label={t("balance")}
          value={minorMoney(data.summary.moneyMinor, locale)}
          hint="EUR"
          icon={<CircleDollarSign />}
        />
        <Stat
          label={t("activity")}
          value={data.campaigns.reduce((sum, c) => sum + (c.validatedCount || 0), 0)}
          hint={t("statusVALIDATED")}
          icon={<Check />}
        />
      </div>
      <AdvertiserAnalytics />
      {creating && (
        <CampaignForm
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
      {!data.campaigns.length ? (
        <Empty>{t("noRecords")}</Empty>
      ) : (
        <div className="campaign-grid">
          {data.campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              fundingEnabled={data.fundingEnabled}
              reload={reload}
            />
          ))}
        </div>
      )}
      <AdvertiserIntegrationsHub campaigns={data.campaigns} />
      <WorkspaceTeamPanel />
    </>
  );
}
function Opportunity({ campaign }: { campaign: Campaign }) {
  const { t } = useLocale();
  const { data, reload } = useDashboard();
  const action = useAction();
  const promoAction = useAction();
  const [submitted, setSubmitted] = useState(false);
  const [variantId, setVariantId] = useState<string>(campaign.abVariants?.[0]?.id || "");
  const [promoCode, setPromoCode] = useState<string>(campaign.creatorPromoCode?.code || "");
  const [showQr, setShowQr] = useState(false);
  const key = useRef<string | null>(null);
  const joined = campaign.eventId && data?.events.some((e) => e.id === campaign.eventId);

  const activeVariant = campaign.abVariants?.find((v) => v.id === variantId);
  const targetUrl = activeVariant?.destinationUrl || campaign.destinationUrl;
  const brief = campaign.creativeBrief;
  const hasBrief = Boolean(
    brief &&
    (brief.headline ||
      brief.talkingPoints?.length ||
      brief.hashtags?.length ||
      brief.cta ||
      brief.formatHint),
  );

  async function generatePromo() {
    const out = await promoAction.run(
      () => api<{ promoCode: { code: string } }>("/promo-codes", { campaignId: campaign.id }),
      t("p4PromoCodeLabel"),
    );
    if (out) setPromoCode(out.promoCode.code);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    key.current ??= crypto.randomUUID();
    const f = new FormData(e.currentTarget);
    const evidence = String(f.get("evidence") || "").trim();
    const enteredPromo = String(f.get("promoCode") || "")
      .trim()
      .toUpperCase();
    const result = await action.run(
      () =>
        api("/activities", {
          campaignId: campaign.id,
          type: campaign.objective,
          idempotencyKey: key.current,
          ...(joined ? { eventId: campaign.eventId } : {}),
          ...(evidence ? { evidence } : {}),
          ...(variantId ? { abVariantId: variantId } : {}),
          ...(enteredPromo ? { promoCode: enteredPromo } : {}),
        }),
      t("submitted"),
    );
    if (result) {
      setSubmitted(true);
      await reload();
    }
  }
  const qrShareUrl =
    typeof window !== "undefined" && data?.user.handle
      ? `${window.location.origin}/@${data.user.handle}?promo=${encodeURIComponent(promoCode)}`
      : targetUrl;

  return (
    <article className="campaign-card">
      <div className="panel-header">
        <div className="profile-badge-row" style={{ margin: 0 }}>
          <span className="tag">
            <Check size={12} />
            {t("verified")}
          </span>
          {campaign.deliveryMode === "UGC_BRIEF" && (
            <span className="tag">
              <Sparkles size={12} />
              UGC
            </span>
          )}
          {typeof campaign.relevanceScore === "number" && (
            <span className="tag">
              {t("p4MatchScore")}: {campaign.relevanceScore}%
            </span>
          )}
        </div>
        <Status value={campaign.state} />
      </div>
      <h3>{campaign.name}</h3>
      <p className="panel-description">
        {t(`objective${campaign.objective}` as MessageKey) || campaign.objective}
      </p>
      {typeof campaign.budgetRemainingPct === "number" && (
        <div className="budget-meter">
          <div className="budget-meter-label">
            <small>{t("p4BudgetRemaining")}</small>
            <small>{campaign.budgetRemainingPct}%</small>
          </div>
          <div className="progress-track">
            <span style={{ width: `${campaign.budgetRemainingPct}%` }} />
          </div>
        </div>
      )}
      {campaign.abVariants && campaign.abVariants.length > 0 && (
        <label className="field" style={{ marginTop: 12 }}>
          {t("p4AbSelectVariant")}
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {campaign.abVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}: {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <a
        className="text-link"
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ marginTop: 10 }}
      >
        {t("visitDestination")}
        <ArrowUpRight size={16} />
      </a>
      {hasBrief && brief && (
        <details className="creative-brief-box">
          <summary>{t("p4BriefViewTitle")}</summary>
          <div className="creative-brief-body">
            {brief.headline && <strong>{brief.headline}</strong>}
            {brief.formatHint && <p className="field-hint">{brief.formatHint}</p>}
            {brief.talkingPoints && brief.talkingPoints.length > 0 && (
              <ul>
                {brief.talkingPoints.map((pt, idx) => (
                  <li key={idx}>• {pt}</li>
                ))}
              </ul>
            )}
            {brief.hashtags && brief.hashtags.length > 0 && (
              <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                {brief.hashtags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {brief.cta && <p className="field-hint">CTA: {brief.cta}</p>}
          </div>
        </details>
      )}
      <form onSubmit={submit} className="form-stack" style={{ marginTop: 20 }}>
        <label className="field">
          {t("evidence")}
          <textarea
            name="evidence"
            minLength={10}
            maxLength={1000}
            required={campaign.objective === "CONVERSION" || campaign.deliveryMode === "UGC_BRIEF"}
            disabled={submitted}
          />
        </label>
        <label className="field">
          {t("p4PromoOptionalInput")}
          <input name="promoCode" maxLength={24} placeholder="MIRA-7A3B" disabled={submitted} />
          <span className="field-hint">{t("p4PromoHint")}</span>
        </label>
        <p className="field-hint">{t("activityDisclaimer")}</p>
        <button
          className="button button-small button-secondary"
          disabled={action.busy || submitted}
        >
          {t(action.busy ? "working" : submitted ? "statusPENDING_VALIDATION" : "participate")}
        </button>
      </form>
      {data?.user.roles.includes("CREATOR") && (
        <div className="creator-kit-actions">
          <TrackedShare surface="CAMPAIGN" targetId={campaign.id} />
          {!promoCode ? (
            <button
              type="button"
              className="button button-small button-secondary"
              disabled={promoAction.busy}
              onClick={() => void generatePromo()}
            >
              <Tag size={15} />
              {t("p4PromoGenerate")}
            </button>
          ) : (
            <div className="promo-mini-box">
              <div className="share-copy">
                <code>{promoCode}</code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("p2CopyLink")}
                  onClick={() =>
                    void promoAction.run(
                      () => navigator.clipboard.writeText(promoCode),
                      t("p4PromoCopied"),
                    )
                  }
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(showQr ? "p4HideQr" : "p4ShowQr")}
                  onClick={() => setShowQr(!showQr)}
                >
                  <QrCode size={14} />
                </button>
              </div>
              {showQr && <PromoQrBox url={qrShareUrl} label={promoCode} />}
            </div>
          )}
          {promoAction.notice && <Notice message={promoAction.notice} error={promoAction.failed} />}
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function OpportunitiesScreen({ preferredCampaignId }: { preferredCampaignId?: string }) {
  const { t } = useLocale();
  const [objective, setObjective] = useState("");
  const [category, setCategory] = useState("");
  const result = useResource<{ campaigns: Campaign[] }>(
    `/campaigns?objective=${encodeURIComponent(objective)}&category=${encodeURIComponent(category)}`,
  );
  const eligible =
    result.data?.campaigns
      .filter((c) => c.canParticipate === true)
      .sort(
        (a, b) => Number(b.id === preferredCampaignId) - Number(a.id === preferredCampaignId),
      ) || [];
  return (
    <>
      <PageTitle title={t("opportunities")} description={t("activityDisclaimer")} />
      <div className="panel discovery-filters">
        <label className="field">
          {t("p2FilterObjective")}
          <select value={objective} onChange={(e) => setObjective(e.target.value)}>
            <option value="">{t("p2All")}</option>
            {(["CLICK", "QUALIFIED_VIEW", "CONVERSION", "SPONSORED_MISSION"] as const).map(
              (type) => (
                <option value={type} key={type}>
                  {t(`objective${type}`)}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="field">
          {t("p2FilterCategory")}
          <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
        </label>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Notice error message={t("unavailable")} />
      ) : !eligible.length ? (
        <Empty>{t("noOpportunities")}</Empty>
      ) : (
        <div className="campaign-grid">
          {eligible.map((c) => (
            <Opportunity key={c.id} campaign={c} />
          ))}
        </div>
      )}
      <div className="form-actions">
        <Link className="text-link" href="/app/events">
          {t("eventLink")}
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}
