"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  Check,
  Compass,
  Filter,
  Flame,
  FlaskConical,
  Megaphone,
  Search,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api, ruNumber } from "@/lib/api";
import type { ExploreMarketplaceData } from "@/server/explore";
import { Empty, Eyebrow, Footer, Orb, PublicNav } from "./ui";

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitch", "X", "Discord"] as const;
const OBJECTIVES = ["CLICK", "QUALIFIED_VIEW", "CONVERSION", "SPONSORED_MISSION"] as const;

export function ExploreMarketplace({ initialData }: { initialData: ExploreMarketplaceData }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState<ExploreMarketplaceData>(initialData);
  const [tab, setTab] = useState<"campaigns" | "creators">("campaigns");
  const [q, setQ] = useState("");
  const [objective, setObjective] = useState("");
  const [platform, setPlatform] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);

  // Pedagogical simulator state
  const [simObjective, setSimObjective] = useState<string>("CONVERSION");
  const [simActions, setSimActions] = useState<number>(25);
  const [simFollowers, setSimFollowers] = useState<number>(350);

  async function applyFilters(e?: FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (objective) sp.set("objective", objective);
      if (platform) sp.set("platform", platform);
      if (country.trim()) sp.set("country", country.trim().toUpperCase());
      const query = sp.toString();
      const fresh = await api<ExploreMarketplaceData>(`/explore${query ? `?${query}` : ""}`);
      setData(fresh);
    } finally {
      setLoading(false);
    }
  }

  async function resetFilters() {
    setQ("");
    setObjective("");
    setPlatform("");
    setCountry("");
    setLoading(true);
    try {
      const fresh = await api<ExploreMarketplaceData>("/explore");
      setData(fresh);
    } finally {
      setLoading(false);
    }
  }

  const simMetrics = useMemo(() => {
    const rate = data.policy.rates[simObjective] ??
      data.policy.rates.CLICK ??
      Object.values(data.policy.rates)[0] ?? {
        creatorRuMicros: "100000",
        userRuMicros: "50000",
        xp: 10,
      };
    const perActionCreatorMicros = BigInt(rate.creatorRuMicros);
    const totalCreatorRuMicros = perActionCreatorMicros * BigInt(simActions);
    const totalXp = rate.xp * simActions;
    const creatorEligible = simFollowers >= data.policy.followerThreshold;
    return {
      totalCreatorRuMicros: totalCreatorRuMicros.toString(),
      totalXp,
      creatorEligible,
    };
  }, [data.policy, simObjective, simActions, simFollowers]);

  return (
    <>
      <PublicNav />
      <main id="main" className="explore-page">
        <section className="explore-hero wrap">
          <div className="explore-hero-copy">
            <Eyebrow>{t("p7ExploreEyebrow")}</Eyebrow>
            <h1>{t("p7ExploreTitle")}</h1>
            <p className="section-copy">{t("p7ExploreSubtitle")}</p>
            {data.development && (
              <div className="dev-banner" style={{ marginTop: 14 }}>
                <FlaskConical size={14} />
                {t("development")}
              </div>
            )}
          </div>
          <div className="explore-hero-orb" aria-hidden="true">
            <Orb size={240} priority sizes="240px" />
          </div>
        </section>

        <section className="wrap explore-controls">
          <form className="panel explore-filter-bar" onSubmit={(e) => void applyFilters(e)}>
            <label className="field">
              <span className="sr-only">{t("p7ExploreSearchPlaceholder")}</span>
              <div className="input-with-icon">
                <Search size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("p7ExploreSearchPlaceholder")}
                  maxLength={80}
                />
              </div>
            </label>
            <label className="field">
              <span className="sr-only">{t("objective")}</span>
              <select value={objective} onChange={(e) => setObjective(e.target.value)}>
                <option value="">{t("p7ExploreFilterAllObjectives")}</option>
                {OBJECTIVES.map((obj) => (
                  <option key={obj} value={obj}>
                    {t(`objective${obj}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="sr-only">{t("p4AllowedPlatforms")}</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="">{t("p7ExploreFilterAllPlatforms")}</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="sr-only">{t("country")}</span>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                placeholder={t("p7ExploreFilterCountryPlaceholder")}
                maxLength={2}
              />
            </label>
            <div className="explore-filter-actions">
              <button type="submit" className="button button-small" disabled={loading}>
                <Filter size={14} />
                {t("p7ExploreApplyFilters")}
              </button>
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={loading}
                onClick={() => void resetFilters()}
              >
                {t("p7ExploreResetFilters")}
              </button>
            </div>
          </form>

          <div className="snippet-tabs" role="tablist" style={{ marginTop: 20 }}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "campaigns"}
              className={`tab-chip ${tab === "campaigns" ? "active" : ""}`}
              onClick={() => setTab("campaigns")}
            >
              <Compass size={14} />
              {t("p7ExploreTabCampaigns")} ({data.campaigns.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "creators"}
              className={`tab-chip ${tab === "creators" ? "active" : ""}`}
              onClick={() => setTab("creators")}
            >
              <Users size={14} />
              {t("p7ExploreTabCreators")} ({data.creators.length})
            </button>
          </div>
        </section>

        <section className="wrap explore-results">
          {tab === "campaigns" ? (
            data.campaigns.length === 0 ? (
              <Empty>{t("p7ExploreNoCampaigns")}</Empty>
            ) : (
              <div className="campaign-grid">
                {data.campaigns.map((camp) => (
                  <article key={camp.id} className="campaign-card explore-card">
                    <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                      <span className="tag">
                        <Check size={12} />
                        {t("verified")}
                      </span>
                      <span className="tag">{t(`objective${camp.objective}` as MessageKey)}</span>
                      {camp.hasSmartRouting && (
                        <span className="tag tag-verified">
                          <Smartphone size={12} />
                          {t("p7ExploreSmartRoutingBadge")}
                        </span>
                      )}
                      {camp.hasBrief && (
                        <span className="tag">
                          <Sparkles size={12} />
                          {t("p7ExploreBriefBadge")}
                        </span>
                      )}
                    </div>
                    <h3>{camp.name}</h3>
                    <p className="field-hint" style={{ margin: "0 0 8px" }}>
                      {camp.advertiserName}
                      {camp.allowedCountries.length > 0
                        ? ` · ${camp.allowedCountries.slice(0, 4).join(", ")}`
                        : ""}
                    </p>
                    <p className="panel-description">{camp.description}</p>
                    <div className="budget-meter">
                      <div className="budget-meter-label">
                        <small>{t("p4BudgetRemaining")}</small>
                        <small className="number">{camp.budgetRemainingPct}%</small>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${camp.budgetRemainingPct}%` }} />
                      </div>
                    </div>
                    <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                      <span className="tag">
                        {t("p7ExploreMinFollowers")}:{" "}
                        {camp.minimumCreatorFollowers.toLocaleString(locale)}
                      </span>
                      {camp.allowedPlatforms.slice(0, 3).map((p) => (
                        <span key={p} className="tag">
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="explore-card-footer">
                      <Link
                        href={`/app/promote?campaign=${encodeURIComponent(camp.id)}`}
                        className="button button-small"
                      >
                        <Megaphone size={14} />
                        {t("p7ExplorePromoteBtn")}
                        <ArrowUpRight size={15} />
                      </Link>
                      <Link
                        href={`/offers/${encodeURIComponent(camp.id)}`}
                        className="button button-small button-secondary"
                      >
                        {t("p8OfferViewDetails")}
                      </Link>
                      {camp.isDemo && <small className="field-hint">{t("development")}</small>}
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : data.creators.length === 0 ? (
            <Empty>{t("p7ExploreNoCreators")}</Empty>
          ) : (
            <div className="campaign-grid">
              {data.creators.map((creator) => (
                <article key={creator.handle} className="campaign-card explore-card">
                  <div className="quick-profile-top">
                    <span className="avatar">
                      {creator.displayName.substring(0, 2).toLowerCase()}
                    </span>
                    <div>
                      <h3>{creator.displayName}</h3>
                      <p className="handle">@{creator.handle}</p>
                    </div>
                  </div>
                  <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                    <span className="tag">{creator.category}</span>
                    {creator.city && <span className="tag">{creator.city}</span>}
                    <span className="tag number">
                      {creator.followers.toLocaleString(locale)} · {t("followers")}
                    </span>
                    {creator.audienceStatus === "VERIFIED" && (
                      <span className="tag tag-verified">
                        <BadgeCheck size={12} />
                        {t("p4AudienceVerifiedBadge")}
                      </span>
                    )}
                  </div>
                  {creator.bio && <p className="panel-description">{creator.bio}</p>}
                  <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                    {creator.socialPlatforms.slice(0, 4).map((p) => (
                      <span key={p} className="tag">
                        {p}
                      </span>
                    ))}
                    {creator.showcaseCount > 0 && (
                      <span className="tag">
                        {creator.showcaseCount} {t("p7ExploreShowcaseCount")}
                      </span>
                    )}
                  </div>
                  <div className="explore-card-footer">
                    <Link
                      href={`/@${encodeURIComponent(creator.handle)}`}
                      className="button button-small button-secondary"
                    >
                      {t("p7ExploreViewShowcase")}
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="wrap section-space">
          <div className="panel explore-simulator">
            <div className="panel-header">
              <div>
                <Eyebrow>{t("p7SimEyebrow")}</Eyebrow>
                <h2>{t("p7SimTitle")}</h2>
                <p className="panel-description">{t("p7SimDesc")}</p>
              </div>
              <span className="tag">
                {t("p7SimRuleVersionLabel")}: {data.policy.ruleVersion}
              </span>
            </div>

            <div className="explore-sim-grid">
              <div className="form-stack">
                <label className="field">
                  {t("p7SimObjectiveLabel")}
                  <select value={simObjective} onChange={(e) => setSimObjective(e.target.value)}>
                    {OBJECTIVES.map((obj) => (
                      <option key={obj} value={obj}>
                        {t(`objective${obj}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>
                    {t("p7SimActionsLabel")}: <strong className="number">{simActions}</strong>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={250}
                    step={1}
                    value={simActions}
                    onChange={(e) => setSimActions(Number(e.target.value))}
                  />
                </label>

                <label className="field">
                  <span>
                    {t("p7SimAudienceLabel")}:{" "}
                    <strong className="number">{simFollowers.toLocaleString(locale)}</strong>
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={50000}
                    step={10}
                    value={simFollowers}
                    onChange={(e) => setSimFollowers(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="explore-sim-output">
                <div className="explore-sim-kpi">
                  <span>{t("p7SimEstimatedRu")}</span>
                  <strong className="number">
                    {ruNumber(simMetrics.totalCreatorRuMicros, locale)} {t("ruUnit")}
                  </strong>
                  <small>{t("noCashValue")}</small>
                </div>
                <div className="explore-sim-kpi">
                  <span>{t("p7SimEstimatedXp")}</span>
                  <strong className="number">
                    <Zap size={16} style={{ display: "inline", verticalAlign: "-2px" }} /> +
                    {simMetrics.totalXp.toLocaleString(locale)} {t("xpUnit")}
                  </strong>
                  <small>
                    {simMetrics.creatorEligible
                      ? `${t("eligible")} (>= ${data.policy.followerThreshold} ${t("followers")})`
                      : t("notEligible")}
                  </small>
                </div>
                <Link href="/register" className="button button-small">
                  {t("getLink")}
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>

            <p className="field-hint" style={{ marginTop: 18 }}>
              {t("p7SimDisclaimer")}
            </p>
          </div>
        </section>

        <section className="wrap section-space">
          <div className="panel explore-leaderboard">
            <div className="panel-header">
              <div>
                <Eyebrow>
                  <Trophy
                    size={13}
                    style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }}
                  />
                  XP OPT-IN
                </Eyebrow>
                <h2>{t("p8LeaderboardTitle")}</h2>
                <p className="panel-description">{t("p8LeaderboardSubtitle")}</p>
              </div>
              <span className="tag">{t("noCashValue")}</span>
            </div>

            {!data.leaderboard || data.leaderboard.length === 0 ? (
              <Empty>{t("p8LeaderboardEmpty")}</Empty>
            ) : (
              <div className="leaderboard-list">
                {data.leaderboard.map((entry) => (
                  <article key={entry.handle} className="leaderboard-row">
                    <div className="leaderboard-rank number">#{entry.rank}</div>
                    <div className="leaderboard-identity">
                      <Link
                        href={`/@${encodeURIComponent(entry.handle)}`}
                        className="leaderboard-name"
                      >
                        <strong>{entry.displayName}</strong>
                        <span className="field-hint">@{entry.handle}</span>
                      </Link>
                      <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                        <span className="tag">{entry.category}</span>
                        {entry.audienceStatus === "VERIFIED" && (
                          <span className="tag tag-verified">
                            <BadgeCheck size={12} /> {t("p4AudienceVerifiedBadge")}
                          </span>
                        )}
                        {entry.streakWeeks > 0 && (
                          <span className="tag">
                            <Flame size={12} /> {entry.streakWeeks} {t("p8StreakWeekUnit")}
                          </span>
                        )}
                        {entry.badges.slice(0, 2).map((b) => (
                          <span key={b.code} className="tag">
                            <Award size={12} /> {t(b.labelKey as MessageKey)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="leaderboard-score number">
                      <strong>
                        {entry.totalXp.toLocaleString(locale)} {t("xpUnit")}
                      </strong>
                      <small className="field-hint">
                        {t("p8LeaderboardLevel")} {entry.level} · {entry.reliabilityTier}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
