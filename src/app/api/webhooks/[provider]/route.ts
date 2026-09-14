import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { receiveWebhook } from "@/server/webhooks";
import { response } from "@/server/api";
import { AppError } from "@/server/errors";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const id = randomUUID();
  try {
    const { provider } = await params;
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 32768) {
          await reader.cancel();
          throw new AppError("BODY_TOO_LARGE", "Request exceeds 32 KB.", 413);
        }
        chunks.push(part.value);
      }
    return response(
      await receiveWebhook(
        provider,
        Buffer.concat(chunks),
        request.headers.get("x-ruvora-signature") ?? "",
      ),
      id,
      202,
    );
  } catch (error) {
    const known = error instanceof AppError;
    return response(
      {
        error: {
          code: known ? error.code : "WEBHOOK_REJECTED",
          message: "Callback could not be accepted.",
        },
        requestId: id,
      },
      id,
      known ? error.status : 400,
    );
  }
}
