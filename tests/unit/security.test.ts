import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTotpSecret,
  decodeBase32,
  encodeBase32,
  totpCode,
  verifyTotp,
} from "../../src/server/security/totp";
import { openSecret, sealSecret } from "../../src/server/security/crypto";
import { signWebhook, verifyWebhookSignature } from "../../src/server/security/webhook-signature";
import {
  appEnvironment,
  assertDevelopment,
  validateRuntimeEnvironment,
} from "../../src/server/environment";
import { approvalPayloadHash } from "../../src/server/security/approvals";
afterEach(() => vi.unstubAllEnvs());
describe("security cryptographic contracts", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches RFC 6238 SHA-1 vector at %i seconds", (seconds, expected) => {
    expect(totpCode(secret, Number(seconds) * 1000, 8)).toBe(expected);
  });
  it("rejects reused counters and codes outside the one-step tolerance", () => {
    const now = 1_800_000_000_000,
      current = BigInt(Math.floor(now / 30000));
    expect(verifyTotp(secret, totpCode(secret, now), current - 1n, now)).toBe(current);
    expect(() => verifyTotp(secret, totpCode(secret, now), current, now)).toThrow();
    expect(verifyTotp(secret, totpCode(secret, now + 30000), current, now)).toBe(current + 1n);
    expect(() => verifyTotp(secret, totpCode(secret, now - 60000), -1n, now)).toThrow();
  });
  it("creates independent RFC-compatible base32 secrets", () => {
    expect(decodeBase32(secret).toString()).toBe("12345678901234567890");
    const first = createTotpSecret();
    expect(decodeBase32(first)).toHaveLength(20);
    expect(createTotpSecret()).not.toBe(first);
    expect(() => decodeBase32("INVALID!")).toThrow();
  });
  it("encrypts with fresh nonces and binds ciphertext to its record", () => {
    vi.stubEnv("SECURITY_ENCRYPTION_KEY", Buffer.alloc(32, 73).toString("base64"));
    const value = "fixture-security-token",
      first = sealSecret(value, "record:1"),
      second = sealSecret(value, "record:1");
    expect(first).not.toContain(value);
    expect(first).not.toBe(second);
    expect(openSecret(first, "record:1")).toBe(value);
    expect(() => openSecret(first, "record:2")).toThrow();
    const parts = first.split(".");
    parts[3] = Buffer.from("altered ciphertext").toString("base64url");
    expect(() => openSecret(parts.join("."), "record:1")).toThrow();
    vi.stubEnv("SECURITY_ENCRYPTION_KEY", Buffer.alloc(32, 74).toString("base64"));
    expect(() => openSecret(first, "record:1")).toThrow();
  });
  it("authenticates exact webhook bytes, provider and bounded timestamp", () => {
    const key = "unit-fixture-webhook-secret-with-32-bytes",
      raw = Buffer.from('{"amount":"100"}'),
      now = 1_800_000_000;
    const signature = signWebhook("conversion", raw, key, now);
    expect(() =>
      verifyWebhookSignature("conversion", raw, signature, key, now * 1000),
    ).not.toThrow();
    expect(() => verifyWebhookSignature("payment", raw, signature, key, now * 1000)).toThrow();
    expect(() =>
      verifyWebhookSignature(
        "conversion",
        Buffer.from('{"amount": "100"}'),
        signature,
        key,
        now * 1000,
      ),
    ).toThrow();
    expect(() =>
      verifyWebhookSignature("conversion", raw, signature, key, (now + 301) * 1000),
    ).toThrow();
    expect(() =>
      verifyWebhookSignature("conversion", raw, signature, key, (now - 301) * 1000),
    ).toThrow();
    expect(() =>
      verifyWebhookSignature("conversion", Buffer.alloc(32769), signature, key, now * 1000),
    ).toThrow();
    expect(() => signWebhook("conversion", raw, "short", now)).toThrow();
  });
  it("binds approval identity, rule version and exact canonical payload", () => {
    const value = {
      operation: "RULE_UPDATE" as const,
      targetId: "rule-1",
      ruleVersion: "v1",
      payload: { amount: "100", enabled: true },
    };
    const hash = approvalPayloadHash(value);
    expect(approvalPayloadHash({ ...value, payload: { enabled: true, amount: "100" } })).toBe(hash);
    expect(approvalPayloadHash({ ...value, ruleVersion: "v2" })).not.toBe(hash);
    expect(approvalPayloadHash({ ...value, targetId: "rule-2" })).not.toBe(hash);
    expect(approvalPayloadHash({ ...value, payload: { amount: "101", enabled: true } })).not.toBe(
      hash,
    );
  });
});
describe("application environment isolation", () => {
  it("cannot downgrade a production process through APP_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "development");
    expect(appEnvironment()).toBe("production");
    expect(() => assertDevelopment("Funding")).toThrow();
  });
  it("rejects development adapters in staging even outside a production build", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("PAYMENT_PROVIDER", "development");
    expect(appEnvironment()).toBe("staging");
    expect(() => validateRuntimeEnvironment()).toThrow();
    expect(() => assertDevelopment("Funding")).toThrow();
  });
});
