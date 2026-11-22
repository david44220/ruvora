import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { formatLogEntry } from "../../src/server/logger";
import { retryBackoffMs } from "../../src/server/db";
import { buildPdfDocument } from "../../src/server/pdf";
import { detectVerifiedImageMime } from "../../src/server/evidence";
import { pickCampaignAbVariant } from "../../src/server/attribution";
import {
  createStripeCheckoutSession,
  sendEmailViaResend,
  verifyStripeSignatureHeader,
} from "../../src/server/providers/adapters";
import { fetchPublicBioContainsToken } from "../../src/server/audience-verify";
import { maskDestination } from "../../src/server/payouts";
import { pass05 } from "../../src/i18n/pass05";

describe("Pass 05 technical & product unit invariants", () => {
  it("keeps EN and FR Pass 05 dictionaries 100% symmetric", () => {
    const enKeys = Object.keys(pass05.en).sort();
    const frKeys = Object.keys(pass05.fr).sort();
    expect(enKeys).toEqual(frKeys);
    expect(enKeys.length).toBeGreaterThan(70);
  });

  it("redacts sensitive secret keys in structured JSON logs", () => {
    const raw = formatLogEntry("info", "test_event", {
      requestId: "req-123",
      password: "super-secret-password",
      signingKey: "ruv_whsec_abcd",
      totpSecret: "JBSWY3DPEHPK3PXP",
      nested: { tokenHash: "deadbeef", safe: "visible" },
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.requestId).toBe("req-123");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.signingKey).toBe("[REDACTED]");
    expect(parsed.totpSecret).toBe("[REDACTED]");
    expect((parsed.nested as Record<string, unknown>).tokenHash).toBe("[REDACTED]");
    expect((parsed.nested as Record<string, unknown>).safe).toBe("visible");
  });

  it("computes bounded exponential backoff with jitter for Serializable retries", () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ms = retryBackoffMs(attempt);
      expect(ms).toBeGreaterThanOrEqual(15);
      expect(ms).toBeLessThanOrEqual(400);
    }
  });

  it("generates a spec-compliant zero-dependency PDF 1.4 buffer", () => {
    const pdf = buildPdfDocument("Advertiser Billing Statement 2026-11", [
      { text: "DEVELOPMENT SIMULATION - NOT A STATUTORY TAX INVOICE", bold: true },
      { text: "Total: 150.00 EUR (Événement & Créateurs)" },
    ]);
    const text = pdf.toString("utf8");
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text).toContain("xref\n");
    expect(text).toContain("%%EOF");
    expect(text).toContain("RUVORA");
    expect(text).toContain("Total: 150.00 EUR");
  });

  it("validates PNG/JPEG/WebP magic bytes and blocks disguised SVG/HTML polyglots", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const webp = Buffer.from("RIFF1234WEBPVP8 ", "ascii");
    const svg = Buffer.from(
      "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
    );

    expect(detectVerifiedImageMime(png)).toBe("image/png");
    expect(detectVerifiedImageMime(jpg)).toBe("image/jpeg");
    expect(detectVerifiedImageMime(webp)).toBe("image/webp");
    expect(detectVerifiedImageMime(svg)).toBeNull();
  });

  it("deterministically buckets visitors into weighted A/B campaign variants", () => {
    const variants = [
      { id: "A", label: "Hero A", destinationUrl: "https://brand.example/a", weight: 70 },
      { id: "B", label: "Hero B", destinationUrl: "https://brand.example/b", weight: 30 },
    ];
    const first = pickCampaignAbVariant("visitor-hash-1", "camp-1", variants);
    const second = pickCampaignAbVariant("visitor-hash-1", "camp-1", variants);
    expect(first).toBe(second);
    expect(["A", "B"]).toContain(first);

    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const picked = pickCampaignAbVariant(`visitor-${i}`, "camp-1", variants);
      if (picked) seen.add(picked);
    }
    expect(seen.has("A")).toBe(true);
    expect(seen.has("B")).toBe(true);
  });

  it("verifies Stripe HMAC-SHA256 webhook signatures and rejects stale or tampered callbacks", () => {
    const secret = "whsec_test_secret_1234567890abcdef";
    const body = '{"id":"evt_1","type":"checkout.session.completed"}';
    const nowSec = 1_760_000_000;
    const sig = createHmac("sha256", secret).update(`${nowSec}.${body}`).digest("hex");
    const header = `t=${nowSec},v1=${sig}`;

    expect(verifyStripeSignatureHeader(body, header, secret, 300, nowSec * 1000)).toEqual({
      valid: true,
      timestamp: nowSec,
    });
    expect(verifyStripeSignatureHeader(body + " ", header, secret, 300, nowSec * 1000).valid).toBe(
      false,
    );
    expect(
      verifyStripeSignatureHeader(body, header, secret, 300, (nowSec + 600) * 1000).valid,
    ).toBe(false);
  });

  it("contract-tests Stripe Checkout and Resend adapters via mocked fetch", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock_123456");
    vi.stubEnv("RESEND_API_KEY", "re_test_mock_123456");
    try {
      const stripeFetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "cs_test_123",
              url: "https://checkout.stripe.com/c/pay/cs_test_123",
            }),
            {
              status: 200,
            },
          ),
      );
      const session = await createStripeCheckoutSession(
        {
          amountMinor: 5000n,
          advertiserId: "adv_1",
          idempotencyKey: "idem_stripe_1",
          successUrl: "https://ruvora.test/app/advertiser",
          cancelUrl: "https://ruvora.test/app/advertiser",
        },
        stripeFetch as unknown as typeof fetch,
      );
      expect(session.sessionId).toBe("cs_test_123");
      expect(stripeFetch).toHaveBeenCalledOnce();

      const resendFetch = vi.fn(
        async () => new Response(JSON.stringify({ id: "email_987" }), { status: 200 }),
      );
      const email = await sendEmailViaResend(
        { to: "user@example.com", subject: "Test", text: "Hello", idempotencyKey: "mail_1" },
        resendFetch as unknown as typeof fetch,
      );
      expect(email.providerReference).toBe("email_987");
      expect(resendFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("blocks SSRF private/loopback IP targets in live audience bio verification", async () => {
    await expect(
      fetchPublicBioContainsToken("https://127.0.0.1/profile", "ruvora-verify-ABCD"),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    await expect(
      fetchPublicBioContainsToken("https://169.254.169.254/latest/meta-data", "ruvora-verify-ABCD"),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    expect(maskDestination("FR7630006000011234567890189")).toBe("FR76••••0189");
  });
});
