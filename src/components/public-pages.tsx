"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Share2, Copy, Link2, Trophy, Sparkles, Users } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useResource, useAction } from "@/lib/hooks";
import { type RuvoraEvent, type EventDetail } from "@/lib/types";
import { PublicNav, Footer, Orb, Brand, Eyebrow, Notice, Loading, Empty, ButtonLink } from "./ui";
import { EventCard } from "./workspace-ui";
export interface PublicProfileData {
  profile: {
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
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const p = data.profile;
  async function share() {
    await action.run(async () => {
      if (navigator.share) await navigator.share({ title: p.displayName, url: canonicalUrl });
      else {
        await navigator.clipboard.writeText(canonicalUrl);
        setCopied(true);
      }
    });
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
              <div className="social-icons">
                {p.socialLinks.map((social, i) => (
                  <a
                    key={`${social.platform}-${i}`}
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
              {!p.customLinks.length ? (
                <p className="panel-description">{t("noLinks")}</p>
              ) : (
                p.customLinks.map((link, i) => (
                  <a
                    className="profile-link"
                    key={`${link.url}-${i}`}
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
              )}
              {data.events.map((event) => (
                <Link className="profile-event-mini" key={event.id} href={`/events/${event.slug}`}>
                  <Trophy size={27} />
                  <div>
                    <small>{t("eventTag")}</small>
                    <strong>{event.title}</strong>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
              <ButtonLink href={`/r/${p.handle}`}>{t("supportCreator")}</ButtonLink>
              <p className="profile-disclaimer">{t("noGuarantee")}</p>
              {p.isDemo && <p className="profile-disclaimer">{t("profileDemo")}</p>}
              <div className="profile-powered">
                <Brand />
              </div>
            </div>
          </article>
          <div className="share-row">
            <button onClick={share}>
              {copied ? <Copy size={15} /> : <Share2 size={15} />} {t(copied ? "copied" : "share")}
            </button>
          </div>
          {action.notice && <Notice message={action.notice} error />}
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
export function EventPage({ slug }: { slug: string }) {
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
                    <h1>{e.title}</h1>
                    <p>{e.description}</p>
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
                <div className="event-detail-stats">
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
                      <h3>{t("leaderboard")}</h3>
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
                    <p>{t("eventRuleText")}</p>
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
