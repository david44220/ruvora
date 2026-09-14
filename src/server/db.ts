import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { ruvoraDb?: PrismaClient };
export const db =
  globalDb.ruvoraDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://ruvora:ruvora@localhost:5432/ruvora",
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.ruvoraDb = db;
export type Tx = Prisma.TransactionClient;
/** Every economic decision runs in the same serializable transaction, retried on conflict. */
export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      // Raw FOR UPDATE queries use P2010 in the pg adapter, with the original
      // SQLSTATE nested in driverAdapterError.cause rather than Prisma P2034.
      if (error instanceof Prisma.PrismaClientKnownRequestError && attempt < 4) {
        const meta = error.meta as
          { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
        const sqlState = meta?.code ?? meta?.driverAdapterError?.cause?.originalCode;
        if (
          error.code === "P2034" ||
          (error.code === "P2010" && (sqlState === "40001" || sqlState === "40P01"))
        )
          continue;
      }
      throw error;
    }
  }
}
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}
