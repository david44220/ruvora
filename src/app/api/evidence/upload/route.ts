import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { assertOrigin, clientIp, limitRate, requireUser } from "@/server/auth";
import { uploadEvidenceAttachment } from "@/server/evidence";
import { response } from "@/server/api";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_JSON_BYTES = 3_200_000;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertOrigin(request);
    const user = await requireUser();
    await limitRate("evidence-upload", `${user.id}:${clientIp(request)}`, 20, 300);

    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > MAX_UPLOAD_JSON_BYTES) {
          await reader.cancel();
          throw new AppError("EVIDENCE_TOO_LARGE", "Evidence upload exceeds 2 MB limit.", 413);
        }
        chunks.push(chunk.value);
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    const result = await uploadEvidenceAttachment(user, body);
    return response(result, requestId, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return response(
        { error: { code: error.code, message: error.message }, requestId },
        requestId,
        error.status,
      );
    }
    if (error instanceof ZodError) {
      return response(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message ?? "Invalid upload.",
          },
          requestId,
        },
        requestId,
        400,
      );
    }
    return response(
      { error: { code: "UPLOAD_FAILED", message: "Evidence upload failed." }, requestId },
      requestId,
      400,
    );
  }
}
