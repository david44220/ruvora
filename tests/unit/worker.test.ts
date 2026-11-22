import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processOutboxes } from "../../scripts/process-outboxes";
function operations() {
  return {
    mail: vi.fn().mockResolvedValue({ processed: [] }),
    webhooks: vi.fn().mockResolvedValue({ processed: [] }),
    expire: vi.fn().mockResolvedValue({ count: 0 }),
  };
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.stubEnv("ALLOW_DEV_SEED", "false");
  vi.stubEnv("ALLOW_DEMO_FUNDING", "false");
  vi.stubEnv("DEMO_PASSWORD", undefined);
  vi.stubEnv("DEMO_TOTP_SECRET", undefined);
  vi.stubEnv("EMAIL_PROVIDER", "disabled");
  vi.stubEnv("PAYMENT_PROVIDER", "disabled");
  vi.stubEnv("SECURITY_ENCRYPTION_KEY", Buffer.alloc(32, 67).toString("base64"));
});
afterEach(() => vi.unstubAllEnvs());
describe("outbox worker startup and safe output", () => {
  it("does not claim any queue or expire approvals when the security key is missing", async () => {
    const jobs = operations();
    vi.stubEnv("SECURITY_ENCRYPTION_KEY", "");
    await expect(processOutboxes(jobs)).rejects.toMatchObject({ code: "SECURITY_KEY_REQUIRED" });
    expect(jobs.mail).not.toHaveBeenCalled();
    expect(jobs.webhooks).not.toHaveBeenCalled();
    expect(jobs.expire).not.toHaveBeenCalled();
  });
  it("refuses a development adapter before any production worker mutation", async () => {
    const jobs = operations();
    vi.stubEnv("PAYMENT_PROVIDER", "development");
    await expect(processOutboxes(jobs)).rejects.toMatchObject({ code: "UNSAFE_ENVIRONMENT" });
    expect(jobs.mail).not.toHaveBeenCalled();
    expect(jobs.webhooks).not.toHaveBeenCalled();
    expect(jobs.expire).not.toHaveBeenCalled();
  });
  it("returns only bounded operational metadata even when successful provider results contain bigint and private payloads", async () => {
    const jobs = operations(),
      privateValue = "private-provider-and-mail-canary";
    jobs.mail.mockResolvedValue({
      processed: [
        { id: "mail-1", status: "DELIVERED", message: { variables: { url: privateValue } } },
      ],
    });
    jobs.webhooks.mockResolvedValue({
      processed: [
        {
          eventId: "event-1",
          status: "PROCESSED",
          result: { conversion: { valueMinor: 100n, privateValue } },
        },
        {
          eventId: "event-2",
          status: "RETRY",
          errorCode: "CONVERSION_CORRELATION_FAILED",
          payload: privateValue,
        },
      ],
    });
    jobs.expire.mockResolvedValue({ count: 3 });
    const summary = await processOutboxes(jobs),
      output = JSON.stringify(summary);
    expect(output.includes(privateValue)).toBe(false);
    expect(output.includes("valueMinor")).toBe(false);
    expect(summary).toEqual({
      mail: { count: 1, processed: [{ id: "mail-1", status: "DELIVERED" }] },
      webhooks: {
        count: 2,
        processed: [
          { eventId: "event-1", status: "PROCESSED" },
          { eventId: "event-2", status: "RETRY", errorCode: "CONVERSION_CORRELATION_FAILED" },
        ],
      },
      expiredApprovals: 3,
    });
    expect(jobs.mail).toHaveBeenCalledOnce();
    expect(jobs.webhooks).toHaveBeenCalledOnce();
    expect(jobs.expire).toHaveBeenCalledOnce();
  });
  it("reports pruned rate-limit buckets when cleanup job is enabled", async () => {
    const jobs = {
      ...operations(),
      pruneRateLimits: vi.fn().mockResolvedValue({ count: 7 }),
    };
    const summary = await processOutboxes(jobs);
    expect(summary).toMatchObject({ expiredApprovals: 0, prunedRateLimits: 7 });
    expect(jobs.pruneRateLimits).toHaveBeenCalledOnce();
  });
  it("skips execution cleanly when advisory lock is already held", async () => {
    const jobs = {
      ...operations(),
      withLock: vi.fn().mockResolvedValue({ acquired: false }),
    };
    const summary = await processOutboxes(jobs);
    expect(summary).toEqual({
      skipped: true,
      reason: "LOCK_HELD",
      mail: { count: 0, processed: [] },
      webhooks: { count: 0, processed: [] },
      expiredApprovals: 0,
    });
    expect(jobs.mail).not.toHaveBeenCalled();
    expect(jobs.webhooks).not.toHaveBeenCalled();
    expect(jobs.expire).not.toHaveBeenCalled();
  });
});
