"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Share2,
  Copy,
  Eye,
  Users,
  MousePointer2,
  CheckCircle2,
  Layers3,
  Wallet,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api, minorMoney, ruNumber } from "@/lib/api";
import { useResource, useAction } from "@/lib/hooks";
import { PageTitle, Stat } from "./workspace-ui";
import { Notice, Empty, Loading, Eyebrow } from "./ui";
import { useDashboard } from "./app-context";

type CreatorAnalyticsData = {
  isDemo: boolean;
  summary: {
    profileViews: number;
    attributedSessions: number;
    registrations: number;
    campaignStarts: number;
    validatedActions: number;
    conversions: number;
    rejectedActions: number;
    pendingActivities: number;
    creatorRuMicros: string;
    pendingCreatorRuMicros: string;
    eventJoins: number;
    referrals: number;
    moneyAllocatedMinor: string;
  };
  daily: { date: string; visits: number; starts: number; validatedActions: number }[];
  campaigns: {
    id: string;
    name: string;
    starts: number;
    validatedActions: number;
    rejectedActions: number;
    creatorRuMicros: string;
  }[];
  allocations: { distributionId: string; createdAt: string; amountMinor: string }[];
};
type AdvertiserAnalyticsData = {
  summary: {
    campaigns: number;
    validatedActions: number;
    rejectedActions: number;
    pendingActivities: number;
    conversions: number;
    grossSpendMinor: string;
    reversedSpendMinor: string;
    netSpendMinor: string;
    advertiserRuMicros: string;
  };
  campaigns: {
    id: string;
    name: string;
    validatedActions: number;
    rejectedActions: number;
    spendMinor: string;
    creatorCount: number;
  }[];
  creators: {
    creatorId: string;
    displayName: string;
    validatedActions: number;
    spendMinor: string;
  }[];
};
type GrowthData = {
  summary: {
    profileViews: number;
    attributedSessions: number;
    registrations: number;
    creatorRegistrations: number;
    referralRegistrations: number;
    eventShares: number;
    eventJoins: number;
    shareRegistrations: number;
    publishingCreators: number;
  };
  topCreators: {
    handle: string;
    displayName: string;
    visits: number;
    registrations: number;
    validatedActions: number;
    creatorRuMicros: string;
  }[];
};

export function TrackedShare({
  surface,
  targetId,
  entryUrl,
  cardUrl,
}: {
  surface: "PROFILE" | "EVENT" | "CAMPAIGN" | "REFERRAL";
  targetId?: string;
  entryUrl?: string;
  cardUrl?: string;
}) {
  const { t } = useLocale();
  const action = useAction();
  const [url, setUrl] = useState(entryUrl ?? "");
  async function share() {
    await action.run(async () => {
      let value = url;
      if (!value) {
        const result = await api<{ url?: string; shareLink?: { slug: string }; slug?: string }>(
          "/shares",
          { surface, ...(targetId ? { targetId } : {}) },
        );
        value = result.url ?? `/go/${result.slug ?? result.shareLink?.slug}`;
        setUrl(value);
      }
      const absolute = new URL(value, window.location.origin).href;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Ruvora", url: absolute });
        } catch (e) {
          if ((e as Error).name !== "AbortError") throw e;
        }
      } else await navigator.clipboard.writeText(absolute);
    }, t("p2ShareReady"));
  }
  return (
    <div className="tracked-share">
      <div className="form-actions">
        <button
          className="button button-small button-secondary"
          onClick={share}
          disabled={action.busy}
        >
          <Share2 size={16} />
          {t(action.busy ? "working" : "p2Share")}
        </button>
        {cardUrl && (
          <a className="text-link" href={cardUrl} target="_blank" rel="noopener noreferrer">
            {t("p2ShareCard")}
            <ArrowUpRight size={15} />
          </a>
        )}
      </div>
      {url && (
        <div className="share-copy">
          <span>{url}</span>
          <button
            className="icon-button"
            aria-label={t("p2CopyLink")}
            onClick={() =>
              void action.run(
                () => navigator.clipboard.writeText(new URL(url, window.location.origin).href),
                t("p2CopySuccess"),
              )
            }
          >
            <Copy size={16} />
          </button>
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </div>
  );
}
export function CreatorAnalytics() {
  const { t, locale } = useLocale();
  const { data: dashboard } = useDashboard();
  const result = useResource<CreatorAnalyticsData>("/analytics/creator");
  if (result.loading) return <Loading />;
  if (!result.data) return <Notice error message={t("unavailable")} />;
  const { summary: s, daily, campaigns, allocations } = result.data;
  const max = Math.max(1, ...daily.map((d) => d.visits));
  const funnel = [
    [t("p2Views"), s.profileViews],
    [t("p2Visitors"), s.attributedSessions],
    [t("p2Registrations"), s.registrations],
    [t("p2Validated"), s.validatedActions],
  ] as const;
  return (
    <>
      <div className="analytics-heading">
        <div>
          <h2>{t("p2Analytics")}</h2>
          <p>{t("p2AnalyticsIntro")}</p>
        </div>
        <TrackedShare
          surface="PROFILE"
          targetId={dashboard?.user.id}
          cardUrl={
            dashboard?.user.handle ? `/share-card/profile/${dashboard.user.handle}` : undefined
          }
        />
      </div>
      <div className="stats-grid">
        <Stat label={t("p2Views")} value={s.profileViews.toLocaleString(locale)} icon={<Eye />} />
        <Stat
          label={t("p2Visitors")}
          value={s.attributedSessions.toLocaleString(locale)}
          icon={<Users />}
        />
        <Stat
          label={t("p2Starts")}
          value={s.campaignStarts.toLocaleString(locale)}
          icon={<MousePointer2 />}
        />
        <Stat
          label={t("p2Validated")}
          value={s.validatedActions.toLocaleString(locale)}
          icon={<CheckCircle2 />}
        />
      </div>
      <div className="analytics-story-grid">
        <section className="panel analytics-chart-panel">
          <div className="panel-header">
            <div>
              <Eyebrow>{t("p2Views")}</Eyebrow>
              <h3>{t("p2Funnel")}</h3>
            </div>
            <span className="tag">
              {daily.length} {t("p2Days")}
            </span>
          </div>
          {s.profileViews === 0 ? (
            <Empty>{t("p2NoAnalytics")}</Empty>
          ) : (
            <div
              className="visits-chart"
              role="img"
              aria-label={`${t("p2Views")}: ${s.profileViews}`}
            >
              {daily.map((day) => (
                <div
                  className="visits-bar"
                  key={day.date}
                  title={`${day.date}: ${day.visits} ${t("p2Views")}`}
                >
                  <span style={{ height: `${(day.visits / max) * 100}%` }} />
                  <small>{new Date(day.date).getUTCDate()}</small>
                </div>
              ))}
            </div>
          )}
          <p className="field-hint">{t("p2AttributionNote")}</p>
        </section>
        <section className="panel funnel-panel">
          <h3>{t("p2Funnel")}</h3>
          {funnel.map(([label, value], i) => (
            <div className="funnel-row" key={label}>
              <span className="funnel-index">0{i + 1}</span>
              <span>{label}</span>
              <strong>{value.toLocaleString(locale)}</strong>
            </div>
          ))}
        </section>
      </div>
      <div className="stats-grid">
        <Stat
          label={t("p2AttributedRU")}
          value={ruNumber(s.creatorRuMicros, locale)}
          hint={t("noCashValue")}
          icon={<Layers3 />}
        />
        <Stat
          label={t("p2PendingRU")}
          value={ruNumber(s.pendingCreatorRuMicros, locale)}
          hint={t("p2PendingNote")}
          icon={<Layers3 />}
        />
        <Stat
          label={t("p2Allocations")}
          value={minorMoney(s.moneyAllocatedMinor, locale)}
          icon={<Wallet />}
        />
        <Stat label={t("p2Conversions")} value={s.conversions} icon={<CheckCircle2 />} />
      </div>
      <section className="panel">
        <h3>{t("p2ByCampaign")}</h3>
        {campaigns.length ? (
          <div className="metric-card-list">
            {campaigns.map((c) => (
              <article className="metric-card" key={c.id}>
                <h4>{c.name}</h4>
                <dl>
                  <div>
                    <dt>{t("p2Starts")}</dt>
                    <dd>{c.starts}</dd>
                  </div>
                  <div>
                    <dt>{t("p2Validated")}</dt>
                    <dd>{c.validatedActions}</dd>
                  </div>
                  <div>
                    <dt>{t("p2Rejected")}</dt>
                    <dd>{c.rejectedActions}</dd>
                  </div>
                  <div>
                    <dt>{t("creatorRU")}</dt>
                    <dd>{ruNumber(c.creatorRuMicros, locale)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <Empty>{t("noRecords")}</Empty>
        )}
      </section>
      <section className="panel admin-section">
        <h3>{t("p2Allocations")}</h3>
        {allocations.length ? (
          <div className="allocation-list">
            {allocations.map((row) => (
              <div key={row.distributionId}>
                <span>{new Date(row.createdAt).toLocaleDateString(locale)}</span>
                <strong>{minorMoney(row.amountMinor, locale)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t("noRecords")}</Empty>
        )}
      </section>
    </>
  );
}
export function AdvertiserAnalytics() {
  const { t, locale } = useLocale();
  const result = useResource<AdvertiserAnalyticsData>("/analytics/advertiser");
  if (result.loading) return <Loading />;
  if (!result.data) return <Notice error message={t("unavailable")} />;
  const { summary: s, campaigns, creators } = result.data;
  const total = s.validatedActions + s.rejectedActions;
  return (
    <section className="admin-section">
      <h2>{t("p2ByCampaign")}</h2>
      <div className="stats-grid">
        <Stat label={t("p2MediaSpend")} value={minorMoney(s.netSpendMinor, locale)} />
        <Stat label={t("p2Validated")} value={s.validatedActions} />
        <Stat
          label={t("p2InvalidRate")}
          value={
            total
              ? `${((s.rejectedActions / total) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
              : "—"
          }
        />
        <Stat label={t("p2Conversions")} value={s.conversions} />
      </div>
      <div className="metric-card-list">
        {campaigns.map((c) => (
          <article className="panel metric-card" key={c.id}>
            <h3>{c.name}</h3>
            <dl>
              <div>
                <dt>{t("p2MediaSpend")}</dt>
                <dd>{minorMoney(c.spendMinor, locale)}</dd>
              </div>
              <div>
                <dt>{t("p2Validated")}</dt>
                <dd>{c.validatedActions}</dd>
              </div>
              <div>
                <dt>{t("p2Rejected")}</dt>
                <dd>{c.rejectedActions}</dd>
              </div>
              <div>
                <dt>{t("roleCREATOR")}</dt>
                <dd>{c.creatorCount}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="panel admin-section">
        <h3>{t("p2ByOrigin")}</h3>
        {creators.length ? (
          <div className="allocation-list">
            {creators.map((c) => (
              <div key={c.creatorId}>
                <span>
                  {c.displayName}
                  <small>
                    {c.validatedActions} · {t("p2Validated")}
                  </small>
                </span>
                <strong>{minorMoney(c.spendMinor, locale)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t("noRecords")}</Empty>
        )}
      </div>
    </section>
  );
}
export function AdminGrowth() {
  const { t, locale } = useLocale();
  const result = useResource<GrowthData>("/admin/growth");
  if (result.loading) return <Loading />;
  if (!result.data) return <Notice error message={t("unavailable")} />;
  const { s, ...rest } = { s: result.data.summary, ...result.data };
  return (
    <section className="admin-section">
      <h2>{t("p2Growth")}</h2>
      <div className="stats-grid">
        <Stat label={t("p2Views")} value={s.profileViews} />
        <Stat label={t("p2Registrations")} value={s.registrations} />
        <Stat label={t("p2ReferralCount")} value={s.referralRegistrations} />
        <Stat label={t("p2Share")} value={s.eventShares} />
      </div>
      <div className="metric-card-list">
        {rest.topCreators.map((c) => (
          <article className="panel metric-card" key={c.handle}>
            <Link className="text-link" href={`/@${c.handle}`}>
              {c.displayName}
              <ArrowUpRight size={15} />
            </Link>
            <dl>
              <div>
                <dt>{t("p2Views")}</dt>
                <dd>{c.visits}</dd>
              </div>
              <div>
                <dt>{t("p2Registrations")}</dt>
                <dd>{c.registrations}</dd>
              </div>
              <div>
                <dt>{t("p2Validated")}</dt>
                <dd>{c.validatedActions}</dd>
              </div>
              <div>
                <dt>{t("creatorRU")}</dt>
                <dd>{ruNumber(c.creatorRuMicros, locale)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
export function ReferralsScreen() {
  const { t, locale } = useLocale();
  const { data } = useDashboard();
  const ru =
    data?.rewardUnits
      .filter((r) => r.category === "REFERRAL" && r.state === "VALIDATED")
      .reduce((sum, r) => sum + BigInt(r._sum.amountMicros || 0), 0n) ?? 0n;
  return (
    <>
      <PageTitle title={t("p2Referrals")} description={t("p2ReferralIntro")} />
      <div className="stats-grid">
        <Stat label={t("p2ReferralCount")} value={data?.summary.referrals ?? 0} icon={<Users />} />
        <Stat
          label={t("p2ReferralRU")}
          value={ruNumber(ru, locale)}
          hint={t("noCashValue")}
          icon={<Layers3 />}
        />
      </div>
      <section className="panel invitation-panel">
        <Eyebrow>{t("p2ReferralLink")}</Eyebrow>
        <h2>{t("p2ShareIntro")}</h2>
        <TrackedShare surface="REFERRAL" />
        <p className="field-hint">{t("p2DirectOnly")}</p>
      </section>
    </>
  );
}
