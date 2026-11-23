import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { getGoBridgeCard } from "@/server/offers";
import { MobileOfferBridge } from "@/components/pass08-viral";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner Offer · Ruvora",
  robots: { index: false, follow: false },
};

export default async function GoBridgeCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hdrs = await headers();
  let card;
  try {
    card = await getGoBridgeCard(slug, {
      userAgent: hdrs.get("user-agent"),
      acceptLanguage: hdrs.get("accept-language"),
    });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return <MobileOfferBridge card={card} />;
}
