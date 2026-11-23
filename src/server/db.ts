import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomInt } from "node:crypto";

function positiveIntEnv(name: string, fallback: number, min = 1, max = 100): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const globalDb = globalThis as unknown as { ruvoraDb?: PrismaClient };
export const db =
  globalDb.ruvoraDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://ruvora:ruvora@localhost:5432/ruvora",
      max: positiveIntEnv("DB_POOL_MAX", 15, 2, 100),
      idleTimeoutMillis: positiveIntEnv("DB_POOL_IDLE_MS", 30_000, 1_000, 300_000),
      connectionTimeoutMillis: positiveIntEnv("DB_POOL_CONNECT_TIMEOUT_MS", 10_000, 1_000, 60_000),
      statement_timeout: positiveIntEnv("DB_STATEMENT_TIMEOUT_MS", 25_000, 2_000, 120_000),
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.ruvoraDb = db;
export type Tx = Prisma.TransactionClient;

function isKnownPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return true;
  // Bundled/ESM and generated/CommonJS runtimes can have different constructors.
  // Accept only the known Prisma error envelope, never a bare application code.
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "PrismaClientKnownRequestError" &&
    "message" in error &&
    typeof error.message === "string" &&
    "clientVersion" in error &&
    typeof error.clientVersion === "string" &&
    error.clientVersion.length > 0 &&
    "code" in error &&
    typeof error.code === "string"
  );
}

export function retryBackoffMs(attempt: number): number {
  const base = Math.min(250, 15 * 2 ** attempt);
  return base + randomInt(0, Math.max(10, Math.floor(base / 2)));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isDriverAdapterRetryableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  if ((error as { name?: unknown }).name !== "DriverAdapterError") return false;
  const cause = (error as { cause?: { kind?: unknown; originalCode?: unknown } }).cause;
  return (
    cause?.kind === "TransactionWriteConflict" ||
    cause?.originalCode === "40001" ||
    cause?.originalCode === "40P01"
  );
}

/**
 * Every economic decision runs in a serializable transaction, retried with
 * exponential backoff + jitter on serialization/deadlock contention.
 */
export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      // Raw FOR UPDATE queries use P2010 in the pg adapter, while COMMIT conflicts
      // in Prisma 7 + @prisma/adapter-pg can surface directly as DriverAdapterError.
      if (attempt < 4) {
        if (isDriverAdapterRetryableError(error)) {
          await sleep(retryBackoffMs(attempt));
          continue;
        }
        if (isKnownPrismaError(error)) {
          const meta = error.meta as
            | { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }
            | undefined;
          const sqlState = meta?.code ?? meta?.driverAdapterError?.cause?.originalCode;
          if (
            error.code === "P2034" ||
            (error.code === "P2010" && (sqlState === "40001" || sqlState === "40P01"))
          ) {
            await sleep(retryBackoffMs(attempt));
            continue;
          }
        }
      }
      throw error;
    }
  }
}

/**
 * Acquires a non-blocking PostgreSQL session advisory lock for background workers
 * so concurrent cron runs never double-process outboxes.
 */
export async function withAdvisoryLock<T>(
  lockKey: number,
  work: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const rows = await db.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockKey}::bigint) AS locked
  `;
  if (!rows[0]?.locked) return { acquired: false };
  try {
    const result = await work();
    return { acquired: true, result };
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(${lockKey}::bigint)`.catch(() => undefined);
  }
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}
