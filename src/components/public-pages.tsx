"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, Link2, Trophy, Sparkles, Users } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api, minorMoney } from "@/lib/api";
import { useResource, useAction } from "@/lib/hooks";
import { type RuvoraEvent, type EventDetail } from "@/lib/types";
import { PublicNav, Footer, Orb, Brand, Eyebrow, Notice, Loading, Empty, ButtonLink } from "./ui";
import { TrackedShare } from "./growth";
import { defaultProfileModules } from "./profile-modules";
import type { ProfileModule } from "@/lib/types";
import type { MessageKey } from "@/i18n/messages";
import { EventCard } from "./workspace-ui";
export interface PublicProfileData {
  entry?: { slug: string; url: string } | null;
  referralEntry?: { slug: string; url: string } | null;
  opportunities?: {
    id: string;
    name: string;
    description: string;
    objective: string;
    isDemo: boolean;
    url: string;
  }[];
  trackedEvents?: Record<string, string>;
  profile: {
    profileModules?: ProfileModule[];
    displayName: string;
    handle: string;
    bio: string;
    category: string;
    followers: number;
    socialLinks: { platform: string; url: string; followers: number }[];
    customLinks: { title: string; url: string }[];
    isDemo: boolean;
    level: number;
    xp: number;
  };
  events: RuvoraEvent[];
}
export function PublicProfile({
  data,
  canonicalUrl,
}: {
  data: PublicProfileData;
  canonicalUrl: string;
}) {
  const { t, locale } = useLocale();
  const p = data.profile;
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || !data.entry) return;
    tracked.current = true;
    void api("/attribution/start", { slug: data.entry.slug }).catch(() => {});
  }, [data.entry]);
  const modules = p.profileModules?.length === 5 ? p.profileModules : defaultProfileModules;
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <div className="public-profile-shell">
          <Orb
            className="public-profile-backdrop"
            size={850}
            loading="eager"
            sizes="(max-width: 760px) 750px, 950px"
          />
          <article className="public-profile">
            <div className="public-profile-cover">
              <Orb size={340} priority sizes="(max-width: 760px) 370px, 400px" />
              <span className="tag">{t("linkBrand")}</span>
            </div>
            <div className="public-profile-content">
              <div className="avatar avatar-large">
                {p.displayName.substring(0, 2).toLowerCase()}
                <span>
                  <Sparkles size={14} />
                </span>
              </div>
              <h1>{p.displayName}</h1>
              <p className="handle">@{p.handle}</p>
              <p className="profile-bio">{p.bio}</p>
              <div className="profile-badge-row">
                <span className="tag">{p.category}</span>
                <span className="tag">
                  {p.followers.toLocaleString(locale)} · {t("followers")}
                </span>
              </div>
              <p className="field-hint">{t("selfDeclared")}</p>
              {modules
                .filter((module) => module.visible)
                .map((module) => (
                  <section
                    key={module.type}
                    className={"public-module public-module-" + module.type.toLowerCase()}
                  >
                    {module.type === "SOCIALS" && (
                      <div className="social-icons">
                        {p.socialLinks.map((social, i) => (
                          <a
                            key={i}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={social.platform}
                            className="text-link"
                          >
                            {social.platform}
                            <ArrowUpRight size={13} />
                          </a>
                        ))}
                      </div>
                    )}
                    {module.type === "LINKS" &&
                      (p.customLinks.length ? (
                        p.customLinks.map((link, i) => (
                          <a
                            className="profile-link"
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span>
                              <span className="link-icon">
                                <Link2 size={19} />
                              </span>
                              {link.title}
                            </span>
                            <ArrowUpRight size={19} />
                          </a>
                        ))
                      ) : (
                        <p className="panel-description">{t("noLinks")}</p>
                      ))}
                    {module.type === "OPPORTUNITY" && data.entry && (
                      <div className="featured-opportunities">
                        <Eyebrow>{t("p2Opportunity")}</Eyebrow>
                        {data.opportunities?.length ? (
                          data.opportunities.map((c) => (
                            <article className="profile-opportunity" key={c.id}>
                              <span className="tag">
                                {t(("objective" + c.objective) as MessageKey)}
                              </span>
                              <h3>{c.name}</h3>
                              <p>{c.description || t("p2OpportunityIntro")}</p>
                              <Link href={c.url} className="button button-small">
                                {t("p2ExploreOpportunity")}
                                <ArrowUpRight size={16} />
                              </Link>
                              {c.isDemo && <small>{t("development")}</small>}
                            </article>
                          ))
                        ) : (
                          <p className="panel-description">{t("p2NoFeatured")}</p>
                        )}
                      </div>
                    )}
                    {module.type === "EVENT" &&
                      data.events.map((event) => (
                        <Link
                          className="profile-event-mini"
                          key={event.id}
                          href={data.trackedEvents?.[event.id] ?? "/events/" + event.slug}
                        >
                          <Trophy size={27} />
                          <div>
                            <small>{t("eventTag")}</small>
                            <strong>
                              {event.localizedContent?.[locale]?.title || event.title}
                            </strong>
                          </div>
                          <ArrowUpRight size={18} />
                        </Link>
                      ))}
                    {module.type === "REFERRAL" && data.referralEntry && (
                      <>
                        <ButtonLink href={data.referralEntry.url}>{t("supportCreator")}</ButtonLink>
                        <p className="field-hint">{t("p2DirectOnly")}</p>
                      </>
                    )}
                  </section>
                ))}
              <p className="profile-disclaimer">{t("noGuarantee")}</p>
              {p.isDemo && <p className="profile-disclaimer">{t("profileDemo")}</p>}
              <div className="profile-powered">
                <Brand />
              </div>
            </div>
          </article>
          <TrackedShare
            surface="PROFILE"
            entryUrl={data.entry?.url ?? canonicalUrl}
            cardUrl={"/share-card/profile/" + p.handle}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
export function EventsPage() {
  const { t } = useLocale();
  const result = useResource<{ events: RuvoraEvent[] }>("/events");
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <section className="wrap events-page">
          <Eyebrow>{t("eventEyebrow")}</Eyebrow>
          <h1>{t("navEvents")}</h1>
          <p className="section-copy">{t("eventDescription")}</p>
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <Notice error message={t("unavailable")} />
          ) : result.data?.events.length ? (
            <div className="events-grid">
              {result.data.events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <Empty>{t("noEvents")}</Empty>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
export function EventPage({ slug, entryUrl }: { slug: string; entryUrl?: string }) {
  const { t, locale } = useLocale();
  const result = useResource<EventDetail>(`/events/${encodeURIComponent(slug)}`);
  const action = useAction();
  async function join() {
    if (!result.data) return;
    const joined = await action.run(
      () => api(`/events/${result.data!.event.id}/join`, {}),
      t("joined"),
    );
    if (joined) await result.reload();
  }
  const e = result.data?.event;
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <section className="wrap events-page">
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <>
              <Notice error message={t("unavailable")} />
              <ButtonLink href="/events">{t("eventLink")}</ButtonLink>
            </>
          ) : (
            e && (
              <>
                <div className="event-detail-hero">
                  <Image src="/assets/events/ruvora-event.webp" alt="" fill priority sizes="90vw" />
                  <div>
                    <span className="pill">
                      <Trophy size={14} />
                      {t("eventTag")}
                    </span>
                    <h1>{e.localizedContent?.[locale]?.title || e.title}</h1>
                    <p>{e.localizedContent?.[locale]?.description || e.description}</p>
                    {e.sponsor && (
                      <span className="event-sponsor">
                        {t("p2Sponsor")} {e.sponsor}
                      </span>
                    )}
                    <button
                      className="button"
                      onClick={join}
                      disabled={action.busy || result.data?.joined || e.state !== "ACTIVE"}
                    >
                      {t(action.busy ? "working" : result.data?.joined ? "joined" : "joinEvent")}
                      <ArrowUpRight size={16} />
                    </button>
                    {action.notice && <Notice message={action.notice} error={action.failed} />}
                  </div>
                </div>
                {e.isDemo && <p className="profile-disclaimer">{t("development")}</p>}
                <TrackedShare
                  surface="EVENT"
                  targetId={e.id}
                  entryUrl={entryUrl}
                  cardUrl={"/share-card/event/" + e.slug}
                />
                <div className="event-detail-stats">
                  <div>
                    <small>{t("p2PrizePool")}</small>
                    <strong>{minorMoney(e.fundedMinor ?? "0", locale)}</strong>
                  </div>
                  <div>
                    <small>{t("p2YourRank")}</small>
                    <strong>{result.data?.personal?.rank ?? "—"}</strong>
                  </div>
                  <div>
                    <small>{t("p2YourPrize")}</small>
                    <strong>{minorMoney(result.data?.personalPrizeMinor ?? "0", locale)}</strong>
                  </div>
                  <div>
                    <small>{t("participantsCount")}</small>
                    <strong>{e.participantCount || 0}</strong>
                  </div>
                  <div>
                    <small>{t("ends")}</small>
                    <strong>{new Date(e.endAt).toLocaleDateString(locale)}</strong>
                  </div>
                  <div>
                    <small>{t("eventPoints")}</small>
                    <strong>{result.data?.personal?.points || 0}</strong>
                  </div>
                </div>
                <div className="event-detail-body">
                  <section className="panel">
                    <div className="panel-header">
                      <h3>{t(e.settlement ? "p2FrozenRanking" : "leaderboard")}</h3>
                      <Users size={19} />
                    </div>
                    {!result.data?.leaderboard.length ? (
                      <Empty>{t("noRanking")}</Empty>
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>{t("participants")}</th>
                              <th>{t("eventPoints")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.data.leaderboard.map((row) => (
                              <tr key={row.userId}>
                                <td>{row.rank}</td>
                                <td>
                                  <Link href={`/@${row.handle}`}>
                                    <strong>{row.displayName}</strong>
                                    <small>@{row.handle}</small>
                                  </Link>
                                </td>
                                <td className="number">{row.points.toLocaleString(locale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <h3>{t("rules")}</h3>
                    <p>
                      {e.localizedContent?.[locale]?.rules ||
                        (typeof e.rules === "string" ? e.rules : t("eventRuleText"))}
                    </p>
                    <p className="field-hint">
                      {t("p2RulesVersion")}: {e.configVersion}
                    </p>
                    <p>
                      {t(
                        BigInt(e.prizeBudgetMinor ?? "0") > 0n ? "p2FundedPrizeNote" : "p2NoPrize",
                      )}
                    </p>
                    {e.configuration?.milestones?.map((m) => (
                      <div className="event-milestone" key={m.points}>
                        <Sparkles size={17} />
                        <span>{m.title[locale]}</span>
                        <strong>
                          {m.points} {t("eventPoints")}
                        </strong>
                      </div>
                    ))}
                    {e.configuration?.rewardTiers?.map((tier) => (
                      <div className="event-milestone" key={tier.fromRank}>
                        <span>
                          #{tier.fromRank}
                          {tier.toRank > tier.fromRank ? "–" + tier.toRank : ""}
                        </span>
                        <strong>{(tier.shareBps / 100).toLocaleString(locale)}%</strong>
                      </div>
                    ))}
                    {e.settlement && <p className="field-hint">{t("p2SettlementNote")}</p>}
                    <div className="form-actions">
                      <ButtonLink href="/app/opportunities" secondary small>
                        {t("opportunities")}
                      </ButtonLink>
                    </div>
                  </section>
                </div>
              </>
            )
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = useLocale();
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <article className="wrap legal-page">
          <Eyebrow>{t("brand")}</Eyebrow>
          <h1>{t(kind === "privacy" ? "privacyTitle" : "termsTitle")}</h1>
          <p>{t(kind === "privacy" ? "privacyBody" : "termsBody")}</p>
          <ButtonLink href="/">{t("backHome")}</ButtonLink>
        </article>
      </main>
      <Footer />
    </>
  );
}
export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <div className="error-page">
          <h1>{t("notFound")}</h1>
          <p>{t("notFoundDescription")}</p>
          <ButtonLink href="/">{t("backHome")}</ButtonLink>
        </div>
      </main>
      <Footer />
    </>
  );
}
