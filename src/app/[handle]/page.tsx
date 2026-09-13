import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/server/profiles";
import { AppError } from "@/server/errors";
import { PublicProfile, type PublicProfileData } from "@/components/public-pages";
export const dynamic = "force-dynamic";
const loadProfile = cache(async (value: string) => {
  let segment: string;
  try {
    segment = decodeURIComponent(value);
  } catch {
    notFound();
  }
  if (!/^@[a-z0-9_]{3,24}$/.test(segment)) notFound();
  try {
    return await getPublicProfile(segment.slice(1));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const { profile } = await loadProfile(handle);
  return {
    title: profile.displayName,
    description: profile.bio || undefined,
    alternates: { canonical: `/@${profile.handle}` },
    openGraph: {
      title: `${profile.displayName} · Ruvora Link`,
      description: profile.bio || undefined,
      url: `/@${profile.handle}`,
      images: [{ url: "/assets/orbs/ruvora-orb.webp", width: 1254, height: 1254 }],
    },
    twitter: {
      card: "summary_large_image",
      title: profile.displayName,
      description: profile.bio || undefined,
      images: ["/assets/orbs/ruvora-orb.webp"],
    },
  };
}
export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await loadProfile(handle);
  const serialized = JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as PublicProfileData;
  return (
    <PublicProfile
      data={serialized}
      canonicalUrl={`${process.env.PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000"}/@${data.profile.handle}`}
    />
  );
}
