import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { readEvidenceAttachment } from "@/server/evidence";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { record, bytes } = await readEvidenceAttachment(user, id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${record.filename}"`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const known = error instanceof AppError;
    return Response.json(
      {
        error: {
          code: known ? error.code : "ATTACHMENT_UNAVAILABLE",
          message: known ? error.message : "Unable to load attachment.",
        },
      },
      { status: known ? error.status : 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
