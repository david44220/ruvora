import type { Metadata } from "next";
import { cookies } from "next/headers";
import { messages } from "@/i18n/messages";
import { getExploreMarketplace } from "@/server/explore";
import { ExploreMarketplace } from "@/components/pass07-explore";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await cookies()).get("ruvora_locale")?.value === "fr" ? "fr" : "en";
  const m = messages[locale];
  return {
    title: m.p7NavExplore,
    description: m.p7ExploreSubtitle,
    alternates: { canonical: "/explore" },
    openGraph: {
      title: `${m.p7NavExplore} · Ruvora`,
      description: m.p7ExploreSubtitle,
      url: "/explore",
      images: [{ url: "/assets/share/ruvora-home.webp", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${m.p7NavExplore} · Ruvora`,
      description: m.p7ExploreSubtitle,
      images: ["/assets/share/ruvora-home.webp"],
    },
  };
}

export default async function ExplorePage() {
  const initialData = await getExploreMarketplace();
  return <ExploreMarketplace initialData={initialData} />;
}
