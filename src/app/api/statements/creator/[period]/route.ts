import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { generateCreatorStatementPdf } from "@/server/pdf";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ period: string }> },
) {
  try {
    const user = await requireUser();
    const { period } = await params;
    const { filename, buffer } = await generateCreatorStatementPdf(user, period);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const known = error instanceof AppError;
    return Response.json(
      {
        error: {
          code: known ? error.code : "PDF_FAILED",
          message: known ? error.message : "Could not generate earnings statement PDF.",
        },
      },
      { status: known ? error.status : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
