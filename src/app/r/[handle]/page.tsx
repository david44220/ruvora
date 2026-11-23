import { redirect, notFound } from "next/navigation";
import { getReferralEntry } from "@/server/attribution";
import { AppError } from "@/server/errors";
import { normalizeSocialChannel } from "@/lib/social-channels";

export default async function Referral({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const channel = normalizeSocialChannel(sp.channel);
  let entry;
  try {
    entry = await getReferralEntry(handle, channel);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) notFound();
    throw error;
  }
  redirect(entry.url);
}
