import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { logError } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const [rows, activeRulesCount] = await Promise.all([
      db.$queryRaw<{ ok: number; migrations: bigint }[]>`
        SELECT 1 AS ok,
               (SELECT COUNT(*)::bigint FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL) AS migrations
      `,
      db.economicRule.count({ where: { active: true } }),
    ]);
    const first = rows[0];
    if (first?.ok !== 1 || activeRulesCount === 0) {
      return NextResponse.json(
        {
          status: "not_ready",
          service: "ruvora",
          database: first?.ok === 1 ? "connected" : "unknown",
          policy: activeRulesCount > 0 ? "configured" : "missing",
          latencyMs: Date.now() - startedAt,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        status: "ready",
        service: "ruvora",
        database: "connected",
        policy: "configured",
        migrationsApplied: Number(first.migrations ?? 0n),
        latencyMs: Date.now() - startedAt,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("readiness_check_failed", {
      error: error instanceof Error ? error.message : "DB_UNAVAILABLE",
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        status: "not_ready",
        service: "ruvora",
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
