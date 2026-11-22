"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Award,
  BadgeCheck,
  Check,
  Copy,
  Download,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api, minorMoney } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { encodeQr } from "@/lib/qr";
import type { Dashboard } from "@/lib/types";
import { Eyebrow, Notice, Empty, Loading } from "./ui";

interface QuestItem {
  code: string;
  xpAwarded: number;
  titleKey: string;
  descriptionKey: string;
  href: string;
  completed: boolean;
  claimed: boolean;
  claimedAt: string | null;
}

export function ReliabilityAndQuests({
  data,
  reload,
}: {
  data: Dashboard;
  reload: () => Promise<void>;
}) {
  const { t } = useLocale();
  const questsRes = useResource<{ quests: QuestItem[]; totalQuestXp: number }>("/quests");
  const action = useAction();
  const rel = data.reliability ?? {
    reliabilityScore: 75,
    tier: "EXPLORER" as const,
    validatedCount: data.summary.validatedActivities,
    rejectedCount: 0,
    reversedCount: 0,
  };

  async function claim(questCode: string) {
    const res = await action.run(
      () => api("/quests/claim", { questCode }),
      t("p4NotifQuestClaimed"),
    );
    if (res) {
      await Promise.all([questsRes.reload(), reload()]);
    }
  }

  return (
    <div className="dashboard-grid pass04-grid">
      <section className="panel trust-tier-card">
        <div className="panel-header">
          <div>
            <Eyebrow>{t("p4ReliabilityTitle")}</Eyebrow>
            <h3>{t(`p4Tier${rel.tier}` as MessageKey)}</h3>
          </div>
          <span className={`tier-pill tier-${rel.tier.toLowerCase()}`}>
            <Award size={14} />
            {rel.reliabilityScore}%
          </span>
        </div>
        <div className="progress-track" aria-label={t("p4ReliabilityScore")}>
          <span style={{ width: `${Math.min(100, Math.max(0, rel.reliabilityScore))}%` }} />
        </div>
        <dl className="mini-metrics">
          <div>
            <dt>{t("p2Validated")}</dt>
            <dd>{rel.validatedCount}</dd>
          </div>
          <div>
            <dt>{t("p2Rejected")}</dt>
            <dd>{rel.rejectedCount}</dd>
          </div>
          <div>
            <dt>{t("statusREVERSED")}</dt>
            <dd>{rel.reversedCount}</dd>
          </div>
        </dl>
        <p className="field-hint">{t("p4ReliabilityHint")}</p>
      </section>

      <section className="panel quests-panel">
        <div className="panel-header">
          <div>
            <Eyebrow>{t("p4QuestsTitle")}</Eyebrow>
            <h3>{t("p4QuestsSubtitle")}</h3>
          </div>
          <Sparkles size={18} />
        </div>
        {questsRes.loading ? (
          <Loading />
        ) : (
          <div className="quest-list">
            {(questsRes.data?.quests ?? []).map((q) => (
              <div className={`quest-row ${q.claimed ? "quest-claimed" : ""}`} key={q.code}>
                <div className="quest-copy">
                  <strong>{t(q.titleKey as MessageKey)}</strong>
                  <small>{t(q.descriptionKey as MessageKey)}</small>
                </div>
                <div className="quest-action">
                  <span className="xp-pill">+{q.xpAwarded} XP</span>
                  {q.claimed ? (
                    <span className="quest-done">
                      <Check size={13} />
                      {t("p4QuestClaimed")}
                    </span>
                  ) : q.completed ? (
                    <button
                      type="button"
                      className="button button-small"
                      disabled={action.busy}
                      onClick={() => void claim(q.code)}
                    >
                      {t("p4QuestClaim")}
                    </button>
                  ) : (
                    <Link className="text-link" href={q.href}>
                      {t("p4QuestInProgress")}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {action.notice && <Notice message={action.notice} error={action.failed} />}
        <p className="field-hint" style={{ marginTop: 12 }}>
          {t("p4QuestXpOnlyNote")}
        </p>
      </section>
    </div>
  );
}

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitch", "X", "Discord", "Website"] as const;

export function AudienceVerificationCard({
  data,
  reload,
}: {
  data: Dashboard;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [platform, setPlatform] = useState<string>(
    data.user.audienceVerifiedPlatform || data.user.socialLinks?.[0]?.platform || "Instagram",
  );
  const [code, setCode] = useState<string>(data.user.audienceVerifyCode || "");
  const [proofUrl, setProofUrl] = useState<string>(data.user.socialLinks?.[0]?.url || "");
  const [followers, setFollowers] = useState<string>(
    String(Math.max(10, data.user.followers || 10)),
  );
  const isVerified = data.user.audienceStatus === "VERIFIED";

  async function begin() {
    const res = await action.run(() =>
      api<{ code: string; platform: string }>("/profile/audience/begin", { platform }),
    );
    if (res) {
      setCode(res.code);
      await reload();
    }
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await action.run(
      () =>
        api("/profile/audience/confirm", {
          platform,
          proofUrl: proofUrl.trim(),
          declaredFollowers: Number(followers || 10),
        }),
      t("p4AudienceVerifiedSuccess"),
    );
    if (res) await reload();
  }

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p4AudienceVerifyTitle")}</Eyebrow>
          <h3>{isVerified ? t("p4AudienceVerifiedBadge") : t("p4AudienceSelfDeclaredBadge")}</h3>
        </div>
        <span className={`tag ${isVerified ? "tag-verified" : ""}`}>
          <BadgeCheck size={14} />
          {isVerified
            ? `${t("p4AudienceVerifiedBadge")}${data.user.audienceVerifiedPlatform ? ` · ${data.user.audienceVerifiedPlatform}` : ""}`
            : t("p4AudienceSelfDeclaredBadge")}
        </span>
      </div>
      <p className="panel-description">{t("p4AudienceVerifyDesc")}</p>
      {isVerified && data.user.audienceVerifiedAt && (
        <p className="field-hint" style={{ marginBottom: 14 }}>
          <ShieldCheck size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
          {data.user.audienceVerifiedPlatform} ·{" "}
          {new Date(data.user.audienceVerifiedAt).toLocaleDateString(locale)}
        </p>
      )}
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <label className="field">
          {t("p4AudiencePlatformLabel")}
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={action.busy}
            onClick={() => void begin()}
          >
            {t("p4AudienceBeginBtn")}
          </button>
        </div>
      </div>

      {code && (
        <div className="challenge-code-box">
          <small>{t("p4AudienceCodeLabel")}</small>
          <div className="share-copy">
            <code>{code}</code>
            <button
              type="button"
              className="icon-button"
              aria-label={t("p2CopyLink")}
              onClick={() =>
                void action.run(() => navigator.clipboard.writeText(code), t("p2CopySuccess"))
              }
            >
              <Copy size={15} />
            </button>
          </div>
          <form onSubmit={confirm} className="form-grid" style={{ marginTop: 14 }}>
            <label className="field">
              {t("p4AudienceProofUrlLabel")}
              <input
                type="url"
                required
                pattern="https://.*"
                placeholder="https://www.instagram.com/yourhandle"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
              />
            </label>
            <label className="field">
              {t("p4AudienceFollowersLabel")}
              <input
                type="number"
                min="10"
                step="1"
                required
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </label>
            <div className="full-width">
              <button className="button button-small" disabled={action.busy}>
                <BadgeCheck size={16} />
                {t(action.busy ? "working" : "p4AudienceConfirmBtn")}
              </button>
            </div>
          </form>
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("p4AudienceHonestNote")}
      </p>
    </section>
  );
}

interface PromoCodeRow {
  id: string;
  code: string;
  discountLabel: string;
  usesCount: number;
  campaign: {
    id: string;
    name: string;
    objective: string;
    destinationUrl: string;
    state: string;
  };
}

export function PromoQrBox({ url, label }: { url: string; label: string }) {
  let qr: ReturnType<typeof encodeQr> | null = null;
  try {
    qr = encodeQr(url);
  } catch {
    qr = null;
  }
  if (!qr) return null;
  return (
    <div className="mfa-qr promo-qr-box">
      <svg
        width="148"
        height="148"
        viewBox={qr.viewBox}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <rect width="100%" height="100%" fill="#ffffff" />
        <path d={qr.svgPath} fill="#120f0b" />
      </svg>
    </div>
  );
}

export function CreatorPromoCodesPanel({ handle }: { handle: string | null }) {
  const { t } = useLocale();
  const res = useResource<{ promoCodes: PromoCodeRow[] }>("/promo-codes");
  const action = useAction();
  const [qrId, setQrId] = useState<string | null>(null);

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p4PromoCodesTitle")}</Eyebrow>
          <h3>{t("p4PromoCodesDesc")}</h3>
        </div>
        <Tag size={18} />
      </div>
      {res.loading ? (
        <Loading />
      ) : !res.data?.promoCodes.length ? (
        <Empty>{t("noRecords")}</Empty>
      ) : (
        <div className="metric-card-list">
          {res.data.promoCodes.map((p) => {
            const shareUrl =
              typeof window !== "undefined"
                ? `${window.location.origin}/@${handle || "ruvora"}?promo=${encodeURIComponent(p.code)}`
                : `https://ruvora.app/@${handle || "ruvora"}`;
            const showQr = qrId === p.id;
            return (
              <article className="metric-card promo-card" key={p.id}>
                <h4>{p.campaign.name}</h4>
                <div className="share-copy" style={{ marginBlock: 10 }}>
                  <code>{p.code}</code>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("p2CopyLink")}
                    onClick={() =>
                      void action.run(
                        () => navigator.clipboard.writeText(p.code),
                        t("p4PromoCopied"),
                      )
                    }
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <p className="field-hint">
                  {t("p4PromoUses")}: <strong>{p.usesCount}</strong>
                </p>
                <div className="form-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => setQrId(showQr ? null : p.id)}
                  >
                    <QrCode size={14} />
                    {t(showQr ? "p4HideQr" : "p4ShowQr")}
                  </button>
                </div>
                {showQr && <PromoQrBox url={shareUrl} label={p.code} />}
              </article>
            );
          })}
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}

export function WalletCyclePanel({ data }: { data: Dashboard }) {
  const { t, locale } = useLocale();
  const threshold = BigInt(data.walletMeta?.microPayoutThresholdMinor ?? "500");
  const balanceMinor = BigInt(data.summary.moneyMinor || "0");
  const pct =
    threshold > 0n ? Math.min(100, Math.max(0, Number((balanceMinor * 100n) / threshold))) : 0;
  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p4WalletCycleTitle")}</Eyebrow>
          <h3>{t("p4WalletCycleDesc")}</h3>
        </div>
        <a className="button button-small button-secondary" href="/api/wallet/export" download>
          <Download size={15} />
          {t("p4WalletExportCsv")}
        </a>
      </div>
      <dl className="dist-summary-grid">
        <div>
          <dt>{t("p4WalletThreshold")}</dt>
          <dd>{minorMoney(threshold.toString(), locale)}</dd>
        </div>
        <div>
          <dt>{t("balance")}</dt>
          <dd>{minorMoney(balanceMinor.toString(), locale)}</dd>
        </div>
        <div>
          <dt>{t("p4WalletLastCycle")}</dt>
          <dd style={{ fontSize: 15 }}>
            {data.walletMeta?.lastDistributionAt
              ? new Date(data.walletMeta.lastDistributionAt).toLocaleDateString(locale)
              : t("p4WalletNoCycle")}
          </dd>
        </div>
        <div>
          <dt>{t("status")}</dt>
          <dd style={{ fontSize: 14 }}>{pct}%</dd>
        </div>
      </dl>
      <div className="progress-track">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("p4WalletPayoutStatus")}
      </p>
    </section>
  );
}
