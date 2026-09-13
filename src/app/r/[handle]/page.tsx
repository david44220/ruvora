import { redirect, notFound } from "next/navigation";
import { db } from "@/server/db";
export default async function Referral({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const creator = await db.user.findUnique({
    where: { handle },
    select: { suspended: true, onboarded: true },
  });
  if (!creator || creator.suspended || !creator.onboarded) notFound();
  redirect(`/register?ref=${encodeURIComponent(handle)}`);
}
