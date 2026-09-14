/* eslint-disable @next/next/no-img-element -- ImageResponse renders native image elements to PNG. */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db";
import { messages } from "../i18n/messages";
import { isDevelopment } from "./environment";
const art = readFile(join(process.cwd(), "public/assets/share/ruvora-orb-card.png")).then(
  (buffer) => "data:image/png;base64," + buffer.toString("base64"),
);
export async function renderShareCard(kind: string, slug: string, language: string | null) {
  const locale = language === "fr" ? "fr" : "en";
  const t = messages[locale];
  let title = "",
    subtitle = "",
    eyebrow: string = t.linkBrand;
  let demo = false;
  if (kind === "profile" || kind === "milestone") {
    const profile = await db.user.findUnique({
      where: { handle: slug },
      select: {
        id: true,
        displayName: true,
        bio: true,
        handle: true,
        suspended: true,
        isDemo: true,
      },
    });
    if (!profile || profile.suspended || (!isDevelopment() && profile.isDemo))
      return new Response(null, { status: 404 });
    title = profile.displayName;
    subtitle = profile.bio ?? "@" + profile.handle;
    demo = profile.isDemo;
    if (kind === "milestone") {
      const xp =
        (await db.xpEntry.aggregate({ where: { userId: profile.id }, _sum: { amount: true } }))._sum
          .amount ?? 0;
      if (xp < 100) return new Response(null, { status: 404 });
      eyebrow = t.progression;
      subtitle = `${t.p2Level} ${Math.floor(Math.sqrt(xp / 100)) + 1} · ${xp} ${t.xpUnit}`;
    }
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
  } else return new Response(null, { status: 404 });
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
        <img alt="" src={await art} width={630} height={630} />
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
          <div style={{ display: "flex", fontSize: 19, color: "#edbd89", marginBottom: 20 }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 45 ? 54 : 70,
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
              fontSize: 24,
              lineHeight: 1.4,
              marginTop: 24,
              color: "#c7bfb4",
              maxWidth: 565,
            }}
          >
            {subtitle.slice(0, 150)}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 16, color: "#c7bfb4" }}>
          {demo ? t.development : t.heroDisclaimer}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "cache-control": "public, max-age=60, s-maxage=300",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
