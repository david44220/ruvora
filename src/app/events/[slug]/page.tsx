import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDevelopment } from "@/server/environment";
import { getEventEntry } from "@/server/attribution";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { EventPage } from "@/components/public-pages";
export const dynamic = "force-dynamic";
const visibleStates = [
  "ACTIVE",
  "UPCOMING",
  "PAUSED",
  "COMPLETED",
  "SETTLING",
  "SETTLED",
  "SCHEDULED",
];
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event || !visibleStates.includes(event.state) || (!isDevelopment() && event.isDemo))
    return { title: "Ruvora", robots: { index: false, follow: false } };
  return {
    title: event.title,
    description: event.description,
    robots: event.visibility !== "PUBLIC" ? { index: false, follow: false } : undefined,
    alternates: { canonical: `/events/${slug}` },
    openGraph: {
      title: event.title,
      description: event.description,
      url: `/events/${slug}`,
      images: [{ url: `/share-card/event/${slug}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description,
      images: [`/share-card/event/${slug}`],
    },
  };
}
export default async function Event({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event || !visibleStates.includes(event.state) || (!isDevelopment() && event.isDemo))
    notFound();
  let entry;
  try {
    entry = await getEventEntry(slug);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  return <EventPage slug={slug} entryUrl={entry?.url} />;
}
