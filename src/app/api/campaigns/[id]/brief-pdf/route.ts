import { NextRequest, NextResponse } from "next/server";
import { clientIp, getCurrentUser, limitRate } from "@/server/auth";
import { AppError } from "@/server/errors";
import { generateCampaignBriefPdf } from "@/server/pdf";
import { validateRuntimeEnvironment } from "@/server/environment";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  validateRuntimeEnvironment();
  try {
    await limitRate("brief-pdf-ip", clientIp(request), 40, 60);
    const { id } = await params;
    const user = await getCurrentUser();
    const langParam = request.nextUrl.searchParams.get("lang");
    const cookieLang = request.cookies.get("ruvora_locale")?.value;
    const locale = langParam === "fr" || (!langParam && cookieLang === "fr") ? "fr" : "en";
    const { filename, buffer } = await generateCampaignBriefPdf(id, user, locale);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "BRIEF_PDF_ERROR", message: "Could not generate creative brief PDF." } },
      { status: 500 },
    );
  }
}
