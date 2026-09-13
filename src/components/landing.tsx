"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Fingerprint,
  ShieldCheck,
  Users,
  Layers3,
  AudioLines,
  Sparkles,
  CircleDollarSign,
  Zap,
  Trophy,
  Link2,
  Aperture,
  Play,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { PublicNav, Footer, ButtonLink, Eyebrow, Orb, Brand } from "./ui";
export function ProfilePreview() {
  const { t } = useLocale();
  return (
    <div className="profile-preview">
      <div className="profile-cover">
        <Orb size={270} sizes="280px" />
        <span className="profile-cover-tag">{t("linkBrand")}</span>
      </div>
      <div className="profile-preview-content">
        <div className="avatar avatar-large">
          am
          <span>
            <Sparkles size={13} />
          </span>
        </div>
        <h3>{t("sampleName")}</h3>
        <p className="handle">@{t("sampleHandle")}</p>
        <p className="profile-bio">{t("sampleBio")}</p>
        <div className="social-icons">
          <Aperture size={20} />
          <Play size={19} />
          <AudioLines size={20} />
          <GlobeMark />
        </div>
        <div className="profile-link">
          <span>
            <span className="link-icon">
              <Layers3 size={18} />
            </span>
            {t("latestWork")}
          </span>
          <ArrowUpRight size={17} />
        </div>
        <div className="profile-link">
          <span>
            <span className="link-icon">
              <Users size={18} />
            </span>
            {t("joinCommunity")}
          </span>
          <ArrowUpRight size={17} />
        </div>
        <div className="profile-event-mini">
          <Trophy size={23} />
          <div>
            <small>{t("eventTag")}</small>
            <strong>{t("eventName")}</strong>
          </div>
          <ArrowUpRight size={17} />
        </div>
        <div className="profile-powered">
          <Brand />
        </div>
      </div>
    </div>
  );
}
function GlobeMark() {
  return <Link2 size={19} />;
}
export default function Landing() {
  const { t } = useLocale();
  return (
    <>
      <PublicNav />
      <main id="main">
        <section className="hero">
          <div className="hero-art">
            <Image
              src="/assets/hero/ruvora-flagship.webp"
              alt=""
              fill
              priority
              sizes="(max-width: 760px) 0px, 100vw"
            />
          </div>
          <div className="hero-mobile-art">
            <Orb size={640} priority sizes="(max-width: 760px) 640px, 0px" />
          </div>
          <div className="wrap hero-content">
            <div className="hero-label">
              <span className="label-line" />
              {t("heroEyebrow")}
            </div>
            <h1>
              {t("heroLine1")}
              <br />
              <em>{t("heroLine2")}</em>
            </h1>
            <p className="hero-description">{t("heroDescription")}</p>
            <div className="hero-actions">
              <ButtonLink href="/register">{t("getLink")}</ButtonLink>
              <Link className="text-link" href="/#experience">
                {t("explore")}
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-small">
              <span className="small-avatars">
                <span>a</span>
                <span>m</span>
                <span>j</span>
              </span>
              <div>
                <strong>{t("heroNote")}</strong>
                <small>{t("heroDisclaimer")}</small>
              </div>
            </div>
          </div>
          <div className="hero-bottom wrap">
            <span>01 — 04</span>
            <a href="#experience">
              {t("discover")}
              <ArrowDown size={16} />
            </a>
            <span className="coordinates">{t("independentNature")}</span>
          </div>
        </section>
        <div className="social-strip">
          <div className="wrap">
            <p>{t("independent")}</p>
            <div className="platform-names">
              <span>Instagram</span>
              <span>TikTok</span>
              <span>YouTube</span>
              <span>Twitch</span>
              <span>Discord</span>
              <span>𝕏</span>
            </div>
          </div>
        </div>
        <section className="link-story wrap section-space" id="experience">
          <div className="link-story-copy">
            <Eyebrow>{t("linkEyebrow")}</Eyebrow>
            <h2>{t("linkTitle")}</h2>
            <p className="section-copy">{t("linkDescription")}</p>
            <ul className="feature-list">
              {(["linkFeature1", "linkFeature2", "linkFeature3"] as const).map((key) => (
                <li key={key}>
                  <Check size={17} />
                  {t(key)}
                </li>
              ))}
            </ul>
            <ButtonLink href="/@mira" secondary>
              {t("seeProfile")}
            </ButtonLink>
          </div>
          <div className="link-story-visual">
            <div className="profile-url">
              <span className="tiny-mark">r</span>ruvora.com/@you
              <Link2 size={15} />
            </div>
            <ProfilePreview />
            <p className="preview-label">{t("preview")}</p>
            <div className="floating-caption">
              <Fingerprint size={24} />
              <span>{t("socialWeb")}</span>
            </div>
          </div>
        </section>
        <section className="people-story section-space" id="creators">
          <div className="wrap">
            <div className="section-heading">
              <Eyebrow>{t("peopleEyebrow")}</Eyebrow>
              <h2>{t("peopleTitle")}</h2>
              <p className="section-copy">{t("peopleDescription")}</p>
            </div>
            <div className="people-grid">
              {[
                {
                  label: "creators",
                  title: "creatorTitle",
                  description: "creatorDescription",
                  cta: "startCreating",
                  role: "CREATOR",
                  icon: <Fingerprint />,
                },
                {
                  label: "participants",
                  title: "participantTitle",
                  description: "participantDescription",
                  cta: "startParticipating",
                  role: "USER",
                  icon: <Users />,
                },
                {
                  label: "advertisers",
                  title: "advertiserTitle",
                  description: "advertiserDescription",
                  cta: "startAdvertising",
                  role: "ADVERTISER",
                  icon: <Aperture />,
                },
              ].map((item, i) => (
                <article className="people-card" key={item.role}>
                  <div className="people-card-top">
                    <span>0{i + 1}</span>
                    {item.icon}
                  </div>
                  <small>{t(item.label as "creators")}</small>
                  <h3>{t(item.title as "creatorTitle")}</h3>
                  <p>{t(item.description as "creatorDescription")}</p>
                  <Link href={`/register?role=${item.role}`}>
                    {t(item.cta as "startCreating")}
                    <ArrowUpRight size={18} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="event-story wrap section-space">
          <div className="event-story-top">
            <Eyebrow>{t("eventEyebrow")}</Eyebrow>
            <Link className="text-link" href="/events">
              {t("eventLink")}
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="event-art-card">
            <Image
              src="/assets/events/ruvora-event.webp"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 90vw"
            />
            <div className="event-story-content">
              <span className="pill">
                <Trophy size={14} />
                {t("eventTag")}
              </span>
              <h2>{t("eventTitle")}</h2>
              <p>{t("eventDescription")}</p>
              <ButtonLink href="/events" secondary>
                {t("eventLink")}
              </ButtonLink>
            </div>
            <span className="event-watermark">{t("connectedForward")}</span>
          </div>
        </section>
        <section className="economy-story wrap section-space" id="economy">
          <div className="economy-heading">
            <div>
              <Eyebrow>{t("economyEyebrow")}</Eyebrow>
              <h2>{t("economyTitle")}</h2>
            </div>
            <p className="section-copy">{t("economyDescription")}</p>
          </div>
          <div className="economy-grid">
            {[
              { title: "money", text: "moneyText", icon: <CircleDollarSign /> },
              { title: "ru", text: "ruText", icon: <Layers3 /> },
              { title: "xp", text: "xpText", icon: <Zap /> },
              { title: "points", text: "pointsText", icon: <Trophy /> },
            ].map((item, i) => (
              <article key={item.title}>
                <span className="economy-number">0{i + 1}</span>
                <div className="economy-icon">{item.icon}</div>
                <h3>{t(item.title as "money")}</h3>
                <p>{t(item.text as "moneyText")}</p>
              </article>
            ))}
          </div>
          <div className="trust-band">
            <ShieldCheck size={42} />
            <div>
              <h3>{t("trustTitle")}</h3>
              <p>{t("trustDescription")}</p>
            </div>
            <div className="trust-labels">
              {(["trust1", "trust2", "trust3"] as const).map((key) => (
                <span key={key}>
                  <Check size={14} />
                  {t(key)}
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="final-cta">
          <Orb size={650} sizes="(max-width: 760px) 560px, 690px" />
          <div className="wrap">
            <Eyebrow>{t("finalEyebrow")}</Eyebrow>
            <h2>{t("finalTitle")}</h2>
            <ButtonLink href="/register">{t("getLink")}</ButtonLink>
            <p>{t("noGuarantee")}</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
