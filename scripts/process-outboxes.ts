import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processMailOutbox } from "../src/server/security/email";
import { expireApprovals } from "../src/server/security/approvals";
import { pruneExpiredRateLimits } from "../src/server/auth";
import { processWebhookInbox } from "../src/server/webhooks";
import { validateRuntimeEnvironment } from "../src/server/environment";
import { AppError } from "../src/server/errors";
import { db, withAdvisoryLock } from "../src/server/db";

const WORKER_ADVISORY_LOCK_KEY = 42026005;

type WorkerOperations = {
  mail: () => Promise<{ processed: { id: string; status: string }[] }>;
  webhooks: () => Promise<{
    processed: { eventId: string; status: string; errorCode?: string }[];
  }>;
  expire: () => Promise<{ count: number }>;
  pruneRateLimits?: () => Promise<{ count: number }>;
  withLock?: <T>(
    work: () => Promise<T>,
  ) => Promise<{ acquired: true; result: T } | { acquired: false }>;
};

/** Runtime preflight always happens before any queue claim or expiry mutation. */
export async function processOutboxes(
  operations: WorkerOperations = {
    mail: processMailOutbox,
    webhooks: processWebhookInbox,
    expire: expireApprovals,
    pruneRateLimits: pruneExpiredRateLimits,
    withLock: (work) => withAdvisoryLock(WORKER_ADVISORY_LOCK_KEY, work),
  },
) {
  validateRuntimeEnvironment();
  const runBody = async () => {
    const mail = await operations.mail();
    const webhooks = await operations.webhooks();
    const approvals = await operations.expire();
    const pruned = operations.pruneRateLimits ? await operations.pruneRateLimits() : undefined;
    // Explicit projections keep provider payloads, bigint values and mail secrets
    // out of stdout even when a service later adds fields to its return value.
    return {
      mail: {
        count: mail.processed.length,
        processed: mail.processed
          .slice(0, 100)
          .map((item) => ({ id: item.id, status: item.status })),
      },
      webhooks: {
        count: webhooks.processed.length,
        processed: webhooks.processed.slice(0, 100).map((item) => ({
          eventId: item.eventId,
          status: item.status,
          ...(item.errorCode ? { errorCode: item.errorCode } : {}),
        })),
      },
      expiredApprovals: approvals.count,
      ...(pruned !== undefined ? { prunedRateLimits: pruned.count } : {}),
    };
  };

  if (operations.withLock) {
    const locked = await operations.withLock(runBody);
    if (!locked.acquired) {
      return {
        skipped: true,
        reason: "LOCK_HELD",
        mail: { count: 0, processed: [] },
        webhooks: { count: 0, processed: [] },
        expiredApprovals: 0,
      };
    }
    return locked.result;
  }
  return runBody();
}

async function main() {
  try {
    console.log(JSON.stringify(await processOutboxes()));
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "failed",
        code: error instanceof AppError ? error.code : "WORKER_FAILED",
      }),
    );
    process.exitCode = 1;
  } finally {
    try {
      await db.$disconnect();
    } catch {
      console.error(JSON.stringify({ status: "failed", code: "WORKER_SHUTDOWN_FAILED" }));
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
