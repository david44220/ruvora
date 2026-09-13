import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { EventPage } from "@/components/public-pages";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event) return { title: "Ruvora", robots: { index: false } };
  return {
    title: event.title,
    description: event.description,
    alternates: { canonical: `/events/${slug}` },
    openGraph: {
      title: event.title,
      description: event.description,
      url: `/events/${slug}`,
      images: [{ url: "/assets/events/ruvora-event.webp", width: 1672, height: 941 }],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description,
      images: ["/assets/events/ruvora-event.webp"],
    },
  };
}
export default async function Event({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await db.event.findUnique({ where: { slug } }))) notFound();
  return <EventPage slug={slug} />;
}
