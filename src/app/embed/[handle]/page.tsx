import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/server/profiles";
import { messages } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function EmbedProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const cleanHandle = handle.replace(/^@/, "").toLowerCase();
  let data: Awaited<ReturnType<typeof getPublicProfile>>;
  try {
    data = await getPublicProfile(cleanHandle);
  } catch {
    notFound();
  }
  const locale = (await cookies()).get("ruvora_locale")?.value === "fr" ? "fr" : "en";
  const m = messages[locale];
  const { profile, opportunities } = data;
  const theme = profile.profileTheme || "obsidian";
  const topPromo = opportunities.find((o) => o.promoCode);

  return (
    <main className="embed-shell" data-theme={theme}>
      <article className="embed-card">
        <div className="embed-brand-row">
          <span className="embed-wordmark">ruvora</span>
          {profile.audienceStatus === "VERIFIED" && (
            <span className="verified-badge">✓ {m.p4AudienceVerifiedBadge}</span>
          )}
        </div>
        <h1 className="embed-name">{profile.displayName}</h1>
        <p className="embed-meta">
          @{profile.handle}
          {profile.category ? ` · ${profile.category}` : ""}
          {profile.city ? ` · ${profile.city}` : ""}
          {profile.followers >= 10
            ? ` · ${profile.followers.toLocaleString(locale)} ${m.p5FollowersUnit}`
            : ""}
        </p>
        {profile.bio && <p className="embed-bio">{profile.bio}</p>}
        {topPromo && topPromo.promoCode && (
          <div className="promo-inline-pill">
            <span>{topPromo.name}</span>
            <code>{topPromo.promoCode}</code>
          </div>
        )}
        <div className="embed-actions">
          <Link
            href={`/@${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-small"
          >
            {m.p5EmbedVisitProfile} ↗
          </Link>
        </div>
      </article>
    </main>
  );
}
