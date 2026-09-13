import { NextRequest } from "next/server";
import { handleApi } from "@/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  return handleApi(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: Context) {
  return handleApi(request, (await context.params).path);
}
