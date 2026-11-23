import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCollection } from "@/server/collections";
import { AppError } from "@/server/errors";
import { PublicCollectionView } from "@/components/pass09-collections";

export const dynamic = "force-dynamic";

const loadCollection = cache(async (handle: string, slug: string) => {
  try {
    return await getPublicCollection(handle, slug);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const data = await loadCollection(handle, slug);
  const ogImg = `/share-card/collection/${encodeURIComponent(data.creator.handle)}?collection=${encodeURIComponent(data.collection.slug)}`;
  return {
    title: `${data.collection.title} · @${data.creator.handle}`,
    description: data.collection.description || `${data.creator.displayName} · Ruvora`,
    alternates: { canonical: `/c/${data.creator.handle}/${data.collection.slug}` },
    openGraph: {
      title: `${data.collection.title} · Ruvora`,
      description: data.collection.description || `${data.creator.displayName} · Ruvora`,
      url: `/c/${data.creator.handle}/${data.collection.slug}`,
      images: [{ url: ogImg, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${data.collection.title} · @${data.creator.handle}`,
      description: data.collection.description || undefined,
      images: [ogImg],
    },
  };
}

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const data = await loadCollection(handle, slug);
  const origin = process.env.PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000";
  return (
    <PublicCollectionView
      data={data}
      canonicalUrl={`${origin}/c/${data.creator.handle}/${data.collection.slug}`}
    />
  );
}
