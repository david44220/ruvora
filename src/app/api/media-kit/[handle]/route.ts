import { NextRequest } from "next/server";
import { clientIp, limitRate } from "@/server/auth";
import { validateRuntimeEnvironment } from "@/server/environment";
import { AppError } from "@/server/errors";
import { generateCreatorMediaKitPdf } from "@/server/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  try {
    validateRuntimeEnvironment();
    await limitRate("media-kit-ip", clientIp(request), 40, 60);
    const { handle } = await params;
    const { filename, buffer } = await generateCreatorMediaKitPdf(handle);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const known = error instanceof AppError;
    return Response.json(
      {
        error: {
          code: known ? error.code : "MEDIA_KIT_FAILED",
          message: known ? error.message : "Could not generate creator media kit PDF.",
        },
      },
      { status: known ? error.status : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
