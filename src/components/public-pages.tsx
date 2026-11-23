"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Copy,
  FileText,
  Link2,
  Pin,
  Trophy,
  Sparkles,
  Users,
} from "lucide-react";
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
    promoCode?: string | null;
    discountLabel?: string | null;
  }[];
  showcase?: {
    id: string;
    campaignId: string;
    collectionName: string;
    creatorNote: string;
    name: string;
    description: string;
    objective: string;
    disclosureNote: string;
    isDemo: boolean;
    url: string;
    promoCode?: string | null;
    discountLabel?: string | null;
  }[];
  trackedEvents?: Record<string, string>;
  profile: {
    profileModules?: ProfileModule[];
    displayName: string;
    handle: string;
    bio: string;
    category: string;
    city?: string | null;
    profileTheme?: string | null;
    audienceStatus?: string;
    audienceVerifiedPlatform?: string | null;
    followers: number;
    socialLinks: { platform: string; url: string; followers: number }[];
    customLinks: { id?: string; title: string; url: string; pinned?: boolean }[];
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || !data.entry) return;
    tracked.current = true;
    void api("/attribution/start", { slug: data.entry.slug }).catch(() => {});
  }, [data.entry]);

  function trackCustomLinkClick(linkId: string) {
    const endpoint = `/api/profiles/${encodeURIComponent(p.handle)}/link-click`;
    const body = JSON.stringify({ linkId });
    try {
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Telemetry is strictly best-effort and never blocks navigation.
    }
  }

  const modules = p.profileModules?.length === 5 ? p.profileModules : defaultProfileModules;
  const isVerified = p.audienceStatus === "VERIFIED";
  const theme = p.profileTheme || "obsidian";
  const showcaseItems = data.showcase ?? [];
  const showcasedCampaignIds = new Set(showcaseItems.map((item) => item.campaignId));
  const extraOpportunities = (data.opportunities ?? []).filter(
    (c) => !showcasedCampaignIds.has(c.id),
  );
  const showcaseGroups = new Map<string, typeof showcaseItems>();
  for (const item of showcaseItems) {
    const bucket = showcaseGroups.get(item.collectionName) ?? [];
    bucket.push(item);
    showcaseGroups.set(item.collectionName, bucket);
  }
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
          <article className="public-profile" data-theme={theme}>
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
                {p.city && <span className="tag">{p.city}</span>}
                <span className="tag">
                  {p.followers.toLocaleString(locale)} · {t("followers")}
                </span>
                {isVerified && (
                  <span className="tag tag-verified">
                    <BadgeCheck size={13} />
                    {t("p4AudienceVerifiedBadge")}
                  </span>
                )}
              </div>
              <div className="profile-mediakit-bar">
                <a className="text-link" href={`/api/media-kit/${encodeURIComponent(p.handle)}`}>
                  <FileText size={14} />
                  {t("p7MediaKitBtn")}
                  <ArrowUpRight size={13} />
                </a>
              </div>
              <p className="field-hint">
                {isVerified
                  ? `${t("p4AudienceVerifiedBadge")}${p.audienceVerifiedPlatform ? ` · ${p.audienceVerifiedPlatform}` : ""}`
                  : t("selfDeclared")}
              </p>
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
                        p.customLinks.map((link, i) => {
                          const linkId = link.id || `legacy_${i}`;
                          return (
                            <a
                              className={`profile-link ${link.pinned ? "profile-link-pinned" : ""}`}
                              key={linkId}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => trackCustomLinkClick(linkId)}
                            >
                              <span>
                                <span className="link-icon">
                                  {link.pinned ? <Pin size={18} /> : <Link2 size={19} />}
                                </span>
                                {link.title}
                                {link.pinned && (
                                  <small className="tag">{t("p7LinkPinnedBadge")}</small>
                                )}
                              </span>
                              <ArrowUpRight size={19} />
                            </a>
                          );
                        })
                      ) : (
                        <p className="panel-description">{t("noLinks")}</p>
                      ))}
                    {module.type === "OPPORTUNITY" && data.entry && (
                      <div className="featured-opportunities">
                        {showcaseItems.length > 0 && (
                          <div className="public-showcase-wrap">
                            <Eyebrow>{t("p6PublicShowcaseEyebrow")}</Eyebrow>
                            {[...showcaseGroups.entries()].map(([collection, items]) => (
                              <div key={collection} className="public-showcase-group">
                                <h3 className="public-showcase-heading">{collection}</h3>
                                {items.map((item) => (
                                  <article className="profile-opportunity" key={item.id}>
                                    <div className="profile-badge-row">
                                      <span className="tag">{t("p6PublicPartnerTag")}</span>
                                      <span className="tag">
                                        {t(("objective" + item.objective) as MessageKey)}
                                      </span>
                                    </div>
                                    <h3>{item.name}</h3>
                                    {item.creatorNote ? (
                                      <p className="public-creator-note">
                                        <strong>{t("p6PublicCreatorNoteLabel")}:</strong>{" "}
                                        {item.creatorNote}
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
                                        </span>
                                        <Copy size={13} />
                                        {copiedCode === item.promoCode && (
                                          <small>{t("p4PromoCopied")}</small>
                                        )}
                                      </button>
                                    )}
                                    <Link href={item.url} className="button button-small">
                                      {t("p2ExploreOpportunity")}
                                      <ArrowUpRight size={16} />
                                    </Link>
                                    {item.disclosureNote && <small>{item.disclosureNote}</small>}
                                    {item.isDemo && <small>{t("development")}</small>}
                                  </article>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {extraOpportunities.length > 0 && (
                          <>
                            <Eyebrow>{t("p2Opportunity")}</Eyebrow>
                            {extraOpportunities.map((c) => (
                              <article className="profile-opportunity" key={c.id}>
                                <div className="profile-badge-row">
                                  <span className="tag">{t("p6PublicPartnerTag")}</span>
                                  <span className="tag">
                                    {t(("objective" + c.objective) as MessageKey)}
                                  </span>
                                </div>
                                <h3>{c.name}</h3>
                                <p>{c.description || t("p2OpportunityIntro")}</p>
                                {c.promoCode && (
                                  <button
                                    type="button"
                                    className="promo-inline-pill"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(c.promoCode!);
                                      setCopiedCode(c.promoCode!);
                                    }}
                                  >
                                    <span>
                                      {t("p4PromoCodeLabel")}: <strong>{c.promoCode}</strong>
                                    </span>
                                    <Copy size={13} />
                                    {copiedCode === c.promoCode && (
                                      <small>{t("p4PromoCopied")}</small>
                                    )}
                                  </button>
                                )}
                                <Link href={c.url} className="button button-small">
                                  {t("p2ExploreOpportunity")}
                                  <ArrowUpRight size={16} />
                                </Link>
                                {c.isDemo && <small>{t("development")}</small>}
                              </article>
                            ))}
                          </>
                        )}
                        {showcaseItems.length === 0 && extraOpportunities.length === 0 && (
                          <>
                            <Eyebrow>{t("p2Opportunity")}</Eyebrow>
                            <p className="panel-description">{t("p2NoFeatured")}</p>
                          </>
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
                      <div className="public-viral-cta">
                        <h3>{t("p6PublicViralTitle")}</h3>
                        <p>{t("p6PublicViralDesc")}</p>
                        <ButtonLink href={data.referralEntry.url}>
                          {t("p6PublicViralCta")}
                        </ButtonLink>
                        <p className="field-hint">{t("p2DirectOnly")}</p>
                      </div>
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
                        (typeof e.rules === "string"
                          ? e.rules
                          : e.rules?.[locale] || e.rules?.en || t("eventRuleText"))}
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
