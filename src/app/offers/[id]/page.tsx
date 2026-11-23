import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { messages } from "@/i18n/messages";
import { AppError } from "@/server/errors";
import { getPublicCampaignOffer } from "@/server/offers";
import { PublicOfferSheet } from "@/components/pass08-viral";

export const dynamic = "force-dynamic";

const loadOffer = cache(async (id: string) => {
  try {
    return await getPublicCampaignOffer(id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = (await cookies()).get("ruvora_locale")?.value === "fr" ? "fr" : "en";
  const m = messages[locale];
  const offer = await loadOffer(id);
  const desc = offer.creativeBrief?.headline || offer.description || m.p7ExploreSubtitle;
  const ogImg = `/share-card/campaign/${offer.id}?lang=${locale}`;
  return {
    title: `${offer.name} · ${offer.advertiserName}`,
    description: desc,
    alternates: { canonical: `/offers/${offer.id}` },
    openGraph: {
      title: `${offer.name} · Ruvora`,
      description: desc,
      url: `/offers/${offer.id}`,
      images: [{ url: ogImg, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${offer.name} · Ruvora`,
      description: desc,
      images: [ogImg],
    },
  };
}

export default async function PublicOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await loadOffer(id);
  return <PublicOfferSheet offer={offer} />;
}
