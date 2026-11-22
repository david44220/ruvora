import { NextRequest } from "next/server";
import { clientIp, limitRate } from "@/server/auth";
import { AppError } from "@/server/errors";
import { renderShareCard } from "@/server/share-card";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  try {
    await limitRate("share-card-ip", clientIp(request), 60, 60);
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      return new Response(null, {
        status: 429,
        headers: { "cache-control": "no-store", "retry-after": "60" },
      });
    }
    throw error;
  }
  const { kind, slug } = await params;
  const sp = request.nextUrl.searchParams;
  return renderShareCard(kind, slug, sp.get("lang"), {
    format: sp.get("format"),
    campaignId: sp.get("campaign"),
    download: sp.get("download") === "1",
  });
}
