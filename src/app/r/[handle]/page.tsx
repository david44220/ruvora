import { redirect, notFound } from "next/navigation";
import { getReferralEntry } from "@/server/attribution";
import { AppError } from "@/server/errors";
export default async function Referral({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  let entry;
  try {
    entry = await getReferralEntry(handle);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) notFound();
    throw error;
  }
  redirect(entry.url);
}
