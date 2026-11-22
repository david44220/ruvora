import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight Server-Sent Events (SSE) notification stream for real-time bell badge updates.
 * Sends an initial snapshot and checks for unread changes while keeping the connection bounded (60s).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastKey = "";

      const emitSnapshot = async () => {
        if (closed) return;
        try {
          const [unreadCount, latest] = await Promise.all([
            db.notification.count({ where: { userId: user.id, readAt: null } }),
            db.notification.findFirst({
              where: { userId: user.id },
              orderBy: { createdAt: "desc" },
              select: { id: true, createdAt: true },
            }),
          ]);
          const key = `${unreadCount}:${latest?.id ?? "none"}`;
          if (key !== lastKey) {
            lastKey = key;
            controller.enqueue(
              encoder.encode(
                `event: notifications\ndata: ${JSON.stringify({ unreadCount, latestId: latest?.id ?? null })}\n\n`,
              ),
            );
          } else {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch {
          // Stop cleanly on transient abort
        }
      };

      await emitSnapshot();
      timer = setInterval(() => {
        void emitSnapshot();
      }, 10_000);
      maxTimer = setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(timer);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }, 55_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        if (maxTimer) clearTimeout(maxTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (maxTimer) clearTimeout(maxTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
