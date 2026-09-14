import type { Metadata } from "next";
import { ShareUnavailable } from "@/components/share-unavailable";
import { shareRecoveryDetails } from "@/lib/share-recovery";
export const metadata: Metadata = {
  title: "Ruvora",
  robots: { index: false, follow: false },
};
export default async function ShareUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; retry?: string }>;
}) {
  const { code, retry } = await searchParams;
  return <ShareUnavailable {...shareRecoveryDetails(code, retry)} />;
}
