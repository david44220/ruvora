import { NextRequest } from "next/server";
import { renderShareCard } from "@/server/share-card";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  const { kind, slug } = await params;
  return renderShareCard(kind, slug, request.nextUrl.searchParams.get("lang"));
}
