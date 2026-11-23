/* eslint-disable @next/next/no-img-element -- ImageResponse renders native image elements to PNG. */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db";
import { messages } from "../i18n/messages";
import { isDevelopment } from "./environment";
import { encodeQr } from "../lib/qr";
import { getCreatorCampaignEntry, getProfileEntry, getReferralEntry } from "./attribution";
import { AppError } from "./errors";

const art = readFile(join(process.cwd(), "public/assets/share/ruvora-orb-card.png")).then(
  (buffer) => "data:image/png;base64," + buffer.toString("base64"),
);

export interface ShareCardOptions {
  format?: string | null;
  campaignId?: string | null;
  collectionSlug?: string | null;
  slide?: string | null;
  download?: boolean;
}

function cardDimensions(format?: string | null): {
  mode: "banner" | "square" | "story" | "portrait";
  width: number;
  height: number;
} {
  if (format === "story") return { mode: "story", width: 1080, height: 1920 };
  if (format === "portrait") return { mode: "portrait", width: 1080, height: 1350 };
  if (format === "square") return { mode: "square", width: 1080, height: 1080 };
  return { mode: "banner", width: 1200, height: 630 };
}

function safeOrigin(): string {
  const raw = process.env.APP_URL || "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function renderShareCard(
  kind: string,
  slug: string,
  language: string | null,
  options: ShareCardOptions = {},
) {
  const locale = language === "fr" ? "fr" : "en";
  const t = messages[locale];
  const dim = cardDimensions(options.format);

  let title = "";
  let subtitle = "";
  let eyebrow: string = t.linkBrand;
  let badge = "";
  let promoCode = "";
  let handleLine = "";
  let qrTargetUrl = "";
  let partnerTag = "";
  let bullets: string[] = [];
  let slideFooterCta = "";
  let demo = false;

  if (
    kind === "profile" ||
    kind === "milestone" ||
    kind === "promo" ||
    kind === "referral" ||
    kind === "collection" ||
    kind === "carousel"
  ) {
    const profile = await db.user.findUnique({
      where: { handle: slug },
      select: {
        id: true,
        displayName: true,
        bio: true,
        handle: true,
        category: true,
        audienceStatus: true,
        suspended: true,
        isDemo: true,
      },
    });
    if (!profile || profile.suspended || (!isDevelopment() && profile.isDemo))
      return new Response(null, { status: 404 });

    title = profile.displayName;
    subtitle = profile.bio || "@" + profile.handle;
    handleLine = `@${profile.handle}`;
    demo = profile.isDemo;
    if (profile.audienceStatus === "VERIFIED") badge = t.p6CardVerified;

    if (kind === "milestone") {
      const [actXp, questXp, shareRows, planRows] = await Promise.all([
        db.xpEntry.aggregate({ where: { userId: profile.id }, _sum: { amount: true } }),
        db.questClaim.aggregate({ where: { userId: profile.id }, _sum: { xpAwarded: true } }),
        db.growthEvent.findMany({
          where: { userId: profile.id, type: "SOCIAL_KIT_SHARED" },
          select: { occurredAt: true },
          take: 200,
        }),
        db.creatorPostPlan.findMany({
          where: { userId: profile.id, status: "PUBLISHED" },
          select: { publishedAt: true, updatedAt: true },
          take: 200,
        }),
      ]);
      const xp = Math.max(0, (actXp._sum.amount ?? 0) + (questXp._sum.xpAwarded ?? 0));
      const level = Math.floor(Math.sqrt(xp / 100)) + 1;
      const { computeWeeklyStreak } = await import("../lib/retention");
      const streak = computeWeeklyStreak([
        ...shareRows.map((s) => s.occurredAt),
        ...planRows.map((p) => p.publishedAt ?? p.updatedAt),
      ]);
      eyebrow = t.progression.toUpperCase();
      subtitle = `${t.p2Level} ${level} · ${xp} ${t.xpUnit}${
        streak.currentStreakWeeks > 0 ? ` · ${streak.currentStreakWeeks} ${t.p8StreakWeekUnit}` : ""
      }`;
      qrTargetUrl = `${safeOrigin()}/@${profile.handle}`;
    } else if (kind === "referral") {
      eyebrow = t.p2Referrals.toUpperCase();
      title = t.p6CardReferralTitle;
      subtitle = `${profile.displayName} (@${profile.handle}) · ${t.p6CardReferralSub}`;
      try {
        const entry = await getReferralEntry(
          profile.handle!,
          dim.mode === "story" ? "INSTAGRAM_STORY" : "DIRECT",
        );
        qrTargetUrl = `${safeOrigin()}${entry.url}`;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        qrTargetUrl = `${safeOrigin()}/r/${profile.handle}`;
      }
    } else if (kind === "promo") {
      eyebrow = t.p6CardPartnerBadge;
      partnerTag = t.p6CardPartnerBadge;
      let matchedCampaign: {
        id: string;
        name: string;
        description: string;
        isDemo: boolean;
        creativeBrief: unknown;
      } | null = null;
      if (options.campaignId) {
        const c = await db.campaign.findUnique({
          where: { id: options.campaignId },
          select: {
            id: true,
            name: true,
            description: true,
            state: true,
            isDemo: true,
            creativeBrief: true,
          },
        });
        if (c && c.state === "ACTIVE" && (isDevelopment() || !c.isDemo)) {
          matchedCampaign = c;
        }
      }
      if (matchedCampaign) {
        const brief = matchedCampaign.creativeBrief as { headline?: string } | null;
        title = matchedCampaign.name;
        subtitle = brief?.headline || matchedCampaign.description || profile.bio || "";
        demo = demo || matchedCampaign.isDemo;
        const codeRow = await db.promoCode.findUnique({
          where: {
            creatorId_campaignId: { creatorId: profile.id, campaignId: matchedCampaign.id },
          },
          select: { code: true, active: true },
        });
        if (codeRow?.active) promoCode = codeRow.code;
        try {
          const entry = await getCreatorCampaignEntry(
            profile.handle!,
            matchedCampaign.id,
            dim.mode === "story" ? "INSTAGRAM_STORY" : "DIRECT",
          );
          qrTargetUrl = `${safeOrigin()}${entry.url}`;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          qrTargetUrl = `${safeOrigin()}/@${profile.handle}`;
        }
      } else {
        try {
          const entry = await getProfileEntry(
            profile.handle!,
            dim.mode === "story" ? "INSTAGRAM_STORY" : "DIRECT",
          );
          qrTargetUrl = `${safeOrigin()}${entry.url}`;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          qrTargetUrl = `${safeOrigin()}/@${profile.handle}`;
        }
      }
    } else if (kind === "collection") {
      const colSlug = (options.collectionSlug ?? "").trim().toLowerCase();
      if (!colSlug) return new Response(null, { status: 404 });
      const collection = await db.creatorCollection.findUnique({
        where: { creatorId_slug: { creatorId: profile.id, slug: colSlug } },
        include: {
          items: {
            include: { campaign: { select: { name: true, state: true, isDemo: true } } },
            orderBy: [{ sortOrder: "asc" }],
            take: 6,
          },
        },
      });
      if (!collection || !collection.published) return new Response(null, { status: 404 });
      const activeNames = collection.items
        .filter((it) => it.campaign.state === "ACTIVE" && (isDevelopment() || !it.campaign.isDemo))
        .map((it) => it.campaign.name);
      eyebrow = t.p9CollectionPublicEyebrow;
      title = collection.title;
      subtitle =
        collection.description ||
        (activeNames.length
          ? activeNames.slice(0, 3).join(" · ")
          : `${t.p9CollectionPublicBy} ${profile.displayName}`);
      badge = `${activeNames.length} ${t.p9CollectionOffersCount}`;
      partnerTag = t.p6CardPartnerBadge;
      demo = demo || collection.items.some((it) => it.campaign.isDemo);
      qrTargetUrl = `${safeOrigin()}/c/${profile.handle}/${collection.slug}`;
    } else if (kind === "carousel") {
      const slideRaw = Number.parseInt(options.slide ?? "1", 10);
      const slideIdx = slideRaw === 2 ? 1 : slideRaw === 3 ? 2 : 0;
      let campName = profile.displayName;
      let campDesc = profile.bio || "";
      let campBrief: Record<string, unknown> | null = null;
      let discountLabel: string | null = null;
      if (options.campaignId) {
        const c = await db.campaign.findUnique({
          where: { id: options.campaignId },
          select: {
            id: true,
            name: true,
            description: true,
            state: true,
            isDemo: true,
            creativeBrief: true,
          },
        });
        if (!c || c.state !== "ACTIVE" || (!isDevelopment() && c.isDemo)) {
          return new Response(null, { status: 404 });
        }
        campName = c.name;
        campDesc = c.description;
        campBrief = (c.creativeBrief as Record<string, unknown> | null) ?? null;
        demo = demo || c.isDemo;
        const codeRow = await db.promoCode.findUnique({
          where: { creatorId_campaignId: { creatorId: profile.id, campaignId: c.id } },
          select: { code: true, discountLabel: true, active: true },
        });
        if (codeRow?.active) {
          promoCode = codeRow.code;
          discountLabel = codeRow.discountLabel;
        }
        try {
          const entry = await getCreatorCampaignEntry(profile.handle!, c.id, "INSTAGRAM_STORY");
          qrTargetUrl = `${safeOrigin()}${entry.url}`;
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          qrTargetUrl = `${safeOrigin()}/offers/${c.id}`;
        }
      } else {
        qrTargetUrl = `${safeOrigin()}/@${profile.handle}`;
      }
      const { buildCarouselSlides } = await import("../lib/video-scripts");
      const slides = buildCarouselSlides({
        locale,
        campaignName: campName,
        description: campDesc,
        creatorHandle: profile.handle,
        promoCode: promoCode || null,
        discountLabel,
        brief: campBrief,
      });
      const slide = slides[slideIdx]!;
      eyebrow = slide.eyebrow;
      title = slide.headline;
      subtitle = slide.body;
      bullets = slide.bullets;
      slideFooterCta = slide.cta;
      partnerTag = slide.disclosure;
      if (!slide.showPromo) promoCode = "";
      if (!slide.showQr) qrTargetUrl = "";
    } else if (dim.mode !== "banner") {
      try {
        const entry = await getProfileEntry(
          profile.handle!,
          dim.mode === "story" ? "INSTAGRAM_STORY" : "DIRECT",
        );
        qrTargetUrl = `${safeOrigin()}${entry.url}`;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        qrTargetUrl = `${safeOrigin()}/@${profile.handle}`;
      }
    }
  } else if (kind === "campaign") {
    const now = new Date();
    const campaign = await db.campaign.findUnique({
      where: { id: slug },
      include: { advertiser: { select: { displayName: true, suspended: true } } },
    });
    if (
      !campaign ||
      campaign.state !== "ACTIVE" ||
      campaign.startAt > now ||
      campaign.endAt <= now ||
      campaign.advertiser.suspended ||
      (!isDevelopment() && campaign.isDemo)
    ) {
      return new Response(null, { status: 404 });
    }
    const brief = campaign.creativeBrief as { headline?: string } | null;
    eyebrow = t.p8OfferEyebrow;
    title = campaign.name;
    subtitle = brief?.headline || campaign.description || campaign.objective;
    handleLine = `${t.p8OfferByAdvertiser}: ${campaign.advertiser.displayName}`;
    partnerTag = t.p6CardPartnerBadge;
    badge = campaign.objective;
    demo = campaign.isDemo;
    qrTargetUrl = `${safeOrigin()}/offers/${campaign.id}`;
  } else if (kind === "event") {
    const event = await db.event.findUnique({ where: { slug } });
    if (
      !event ||
      event.visibility !== "PUBLIC" ||
      !["ACTIVE", "PAUSED", "COMPLETED", "SETTLING", "SETTLED", "SCHEDULED"].includes(
        event.state,
      ) ||
      (!isDevelopment() && event.isDemo)
    )
      return new Response(null, { status: 404 });
    const localized = event.localizedContent as {
      en?: { title?: string; description?: string };
      fr?: { title?: string; description?: string };
    };
    title = localized[locale]?.title || event.title;
    subtitle = localized[locale]?.description || event.description;
    eyebrow = t.eventTag;
    demo = event.isDemo;
  } else {
    return new Response(null, { status: 404 });
  }

  let qr: ReturnType<typeof encodeQr> | null = null;
  if (qrTargetUrl) {
    try {
      qr = encodeQr(qrTargetUrl);
    } catch {
      qr = null;
    }
  }

  const artSrc = await art;
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "card";
  const headers: Record<string, string> = {
    "cache-control": "public, max-age=60, s-maxage=300",
    "x-content-type-options": "nosniff",
  };
  if (options.download) {
    headers["content-disposition"] =
      `attachment; filename="ruvora-${kind}-${safeSlug}-${dim.mode}.png"`;
  }

  // Vertical 9:16 Story / TikTok / Reels layout (1080 x 1920)
  if (dim.mode === "story") {
    return new ImageResponse(
      <div
        style={{
          width: 1080,
          height: 1920,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0a09",
          color: "#f4f0e8",
          padding: "88px 76px",
          position: "relative",
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -210,
            top: 180,
            width: 740,
            height: 740,
            opacity: 0.56,
            display: "flex",
          }}
        >
          <img alt="" src={artSrc} width={740} height={740} />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 9, color: "#edbd89" }}>
            RUVORA
          </div>
          {badge ? (
            <div
              style={{
                display: "flex",
                fontSize: 20,
                letterSpacing: 2,
                color: "#0b0a09",
                background: "#edbd89",
                padding: "10px 22px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        {/* Core Hero Copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 660 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 4,
                color: "#edbd89",
              }}
            >
              {eyebrow}
            </div>
            {partnerTag && partnerTag !== eyebrow ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  color: "#c7bfb4",
                  border: "1px solid rgba(237,189,137,0.45)",
                  padding: "6px 14px",
                  borderRadius: 999,
                }}
              >
                {partnerTag}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: title.length > 36 ? 64 : 78,
              lineHeight: 1.06,
              letterSpacing: -2,
              fontWeight: 700,
            }}
          >
            {title.slice(0, 72)}
          </div>

          {handleLine ? (
            <div style={{ display: "flex", fontSize: 30, color: "#edbd89" }}>{handleLine}</div>
          ) : null}

          <div style={{ display: "flex", fontSize: 29, lineHeight: 1.4, color: "#c7bfb4" }}>
            {subtitle.slice(0, 170)}
          </div>

          {bullets.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
              {bullets.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    padding: "18px 24px",
                    borderRadius: 20,
                    background: "rgba(244,240,232,0.06)",
                    border: "1px solid rgba(237,189,137,0.28)",
                    fontSize: 24,
                    lineHeight: 1.35,
                    color: "#f4f0e8",
                  }}
                >
                  <div style={{ display: "flex", color: "#edbd89", fontWeight: 700 }}>0{i + 1}</div>
                  <div style={{ display: "flex", flex: 1 }}>{line}</div>
                </div>
              ))}
            </div>
          ) : null}

          {promoCode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                marginTop: 18,
                padding: "24px 34px",
                borderRadius: 24,
                background: "rgba(237,189,137,0.14)",
                border: "2px solid #edbd89",
                alignSelf: "flex-start",
              }}
            >
              <div style={{ display: "flex", fontSize: 24, color: "#edbd89", letterSpacing: 3 }}>
                {t.p6CardPromoCodePrefix}
              </div>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: 4 }}>
                {promoCode}
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom QR + Disclosure */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            width: "100%",
          }}
        >
          {qr ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 34,
                padding: "30px 34px",
                borderRadius: 28,
                background: "rgba(244,240,232,0.06)",
                border: "1px solid rgba(237,189,137,0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  padding: 16,
                  borderRadius: 20,
                  background: "#f4f0e8",
                }}
              >
                <svg width={210} height={210} viewBox={qr.viewBox}>
                  <rect width="100%" height="100%" fill="#f4f0e8" />
                  <path d={qr.svgPath} fill="#0b0a09" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#f4f0e8" }}>
                  {slideFooterCta || t.p6CardScanCta}
                </div>
                <div style={{ display: "flex", fontSize: 22, color: "#edbd89" }}>
                  {handleLine || "ruvora"}
                </div>
              </div>
            </div>
          ) : slideFooterCta ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "24px 30px",
                borderRadius: 22,
                background: "rgba(237,189,137,0.12)",
                border: "1px solid rgba(237,189,137,0.4)",
                fontSize: 26,
                fontWeight: 700,
                color: "#edbd89",
              }}
            >
              <div style={{ display: "flex" }}>{slideFooterCta}</div>
              <div style={{ display: "flex", fontSize: 20, color: "#f4f0e8" }}>{handleLine}</div>
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: 20, color: "#9c9388" }}>
            {demo ? t.development : partnerTag || t.heroDisclaimer}
          </div>
        </div>
      </div>,
      { width: 1080, height: 1920, headers },
    );
  }

  // Portrait 4:5 Feed Carousel layout (1080 x 1350)
  if (dim.mode === "portrait") {
    return new ImageResponse(
      <div
        style={{
          width: 1080,
          height: 1350,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0a09",
          color: "#f4f0e8",
          padding: "70px 68px",
          position: "relative",
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -190,
            top: 90,
            width: 600,
            height: 600,
            opacity: 0.5,
            display: "flex",
          }}
        >
          <img alt="" src={artSrc} width={600} height={600} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: "#edbd89" }}>
            RUVORA
          </div>
          {badge ? (
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: "#0b0a09",
                background: "#edbd89",
                padding: "8px 18px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#edbd89" }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 36 ? 58 : 70,
              lineHeight: 1.06,
              letterSpacing: -2,
              fontWeight: 700,
              maxWidth: 740,
            }}
          >
            {title.slice(0, 74)}
          </div>
          {handleLine ? (
            <div style={{ display: "flex", fontSize: 26, color: "#edbd89" }}>{handleLine}</div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 26,
              lineHeight: 1.4,
              color: "#c7bfb4",
              maxWidth: 700,
            }}
          >
            {subtitle.slice(0, 165)}
          </div>

          {bullets.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
              {bullets.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    padding: "16px 22px",
                    borderRadius: 18,
                    background: "rgba(244,240,232,0.06)",
                    border: "1px solid rgba(237,189,137,0.3)",
                    fontSize: 22,
                    lineHeight: 1.35,
                    color: "#f4f0e8",
                  }}
                >
                  <div style={{ display: "flex", color: "#edbd89", fontWeight: 700 }}>0{i + 1}</div>
                  <div style={{ display: "flex", flex: 1 }}>{line}</div>
                </div>
              ))}
            </div>
          ) : null}

          {promoCode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                marginTop: 12,
                padding: "18px 28px",
                borderRadius: 20,
                background: "rgba(237,189,137,0.14)",
                border: "2px solid #edbd89",
                alignSelf: "flex-start",
              }}
            >
              <div style={{ display: "flex", fontSize: 20, color: "#edbd89", letterSpacing: 3 }}>
                {t.p6CardPromoCodePrefix}
              </div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 700, letterSpacing: 3 }}>
                {promoCode}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
          {qr ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "24px 28px",
                borderRadius: 24,
                background: "rgba(244,240,232,0.06)",
                border: "1px solid rgba(237,189,137,0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  padding: 14,
                  borderRadius: 18,
                  background: "#f4f0e8",
                }}
              >
                <svg width={170} height={170} viewBox={qr.viewBox}>
                  <rect width="100%" height="100%" fill="#f4f0e8" />
                  <path d={qr.svgPath} fill="#0b0a09" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#f4f0e8" }}>
                  {slideFooterCta || t.p6CardScanCta}
                </div>
                <div style={{ display: "flex", fontSize: 20, color: "#edbd89" }}>
                  {handleLine || "ruvora"}
                </div>
              </div>
            </div>
          ) : slideFooterCta ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 26px",
                borderRadius: 20,
                background: "rgba(237,189,137,0.12)",
                border: "1px solid rgba(237,189,137,0.4)",
                fontSize: 24,
                fontWeight: 700,
                color: "#edbd89",
              }}
            >
              <div style={{ display: "flex" }}>{slideFooterCta}</div>
              <div style={{ display: "flex", fontSize: 19, color: "#f4f0e8" }}>{handleLine}</div>
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: 18, color: "#9c9388" }}>
            {demo ? t.development : partnerTag || t.heroDisclaimer}
          </div>
        </div>
      </div>,
      { width: 1080, height: 1350, headers },
    );
  }

  // Square 1:1 Feed Post layout (1080 x 1080)
  if (dim.mode === "square") {
    return new ImageResponse(
      <div
        style={{
          width: 1080,
          height: 1080,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0a09",
          color: "#f4f0e8",
          padding: "64px 68px",
          position: "relative",
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -175,
            top: 64,
            width: 540,
            height: 540,
            opacity: 0.56,
            display: "flex",
          }}
        >
          <img alt="" src={artSrc} width={540} height={540} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 8, color: "#edbd89" }}>
            RUVORA
          </div>
          {badge ? (
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: "#0b0a09",
                background: "#edbd89",
                padding: "8px 18px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 600 }}>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, color: "#edbd89" }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 36 ? 54 : 68,
              lineHeight: 1.06,
              letterSpacing: -2,
              fontWeight: 700,
            }}
          >
            {title.slice(0, 72)}
          </div>
          <div style={{ display: "flex", fontSize: 24, lineHeight: 1.38, color: "#c7bfb4" }}>
            {subtitle.slice(0, 145)}
          </div>
          {promoCode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 8,
                padding: "14px 24px",
                borderRadius: 18,
                background: "rgba(237,189,137,0.14)",
                border: "2px solid #edbd89",
                alignSelf: "flex-start",
              }}
            >
              <div style={{ display: "flex", fontSize: 19, color: "#edbd89", letterSpacing: 3 }}>
                {t.p6CardPromoCodePrefix}
              </div>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: 3 }}>
                {promoCode}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 680 }}>
            {handleLine ? (
              <div style={{ display: "flex", fontSize: 24, color: "#edbd89" }}>{handleLine}</div>
            ) : null}
            <div style={{ display: "flex", fontSize: 17, color: "#9c9388" }}>
              {demo ? t.development : t.heroDisclaimer}
            </div>
          </div>
          {qr ? (
            <div
              style={{
                display: "flex",
                padding: 12,
                borderRadius: 16,
                background: "#f4f0e8",
              }}
            >
              <svg width={156} height={156} viewBox={qr.viewBox}>
                <rect width="100%" height="100%" fill="#f4f0e8" />
                <path d={qr.svgPath} fill="#0b0a09" />
              </svg>
            </div>
          ) : null}
        </div>
      </div>,
      { width: 1080, height: 1080, headers },
    );
  }

  // Classic 1200 x 630 Open Graph / X / LinkedIn banner (default)
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        background: "#0b0a09",
        color: "#f4f0e8",
        position: "relative",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -45,
          top: 8,
          width: 630,
          height: 630,
          display: "flex",
        }}
      >
        <img alt="" src={artSrc} width={630} height={630} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "55px 60px",
          width: 740,
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 7, color: "#edbd89", display: "flex" }}>
          RUVORA
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 19, color: "#edbd89", marginBottom: 18 }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 45 ? 50 : 66,
              lineHeight: 1.05,
              letterSpacing: -3,
              maxWidth: 660,
            }}
          >
            {title.slice(0, 80)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 23,
              lineHeight: 1.4,
              marginTop: 20,
              color: "#c7bfb4",
              maxWidth: 565,
            }}
          >
            {subtitle.slice(0, 150)}
          </div>
          {promoCode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 18,
                padding: "10px 20px",
                borderRadius: 14,
                background: "rgba(237,189,137,0.14)",
                border: "1px solid #edbd89",
                alignSelf: "flex-start",
              }}
            >
              <div style={{ display: "flex", fontSize: 16, color: "#edbd89" }}>
                {t.p6CardPromoCodePrefix}
              </div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>
                {promoCode}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 16, color: "#c7bfb4" }}>
          {demo ? t.development : t.heroDisclaimer}
        </div>
      </div>
      {qr ? (
        <div
          style={{
            position: "absolute",
            right: 48,
            bottom: 44,
            display: "flex",
            padding: 10,
            borderRadius: 16,
            background: "#f4f0e8",
          }}
        >
          <svg width={132} height={132} viewBox={qr.viewBox}>
            <rect width="100%" height="100%" fill="#f4f0e8" />
            <path d={qr.svgPath} fill="#0b0a09" />
          </svg>
        </div>
      ) : null}
    </div>,
    { width: 1200, height: 630, headers },
  );
}
