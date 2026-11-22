import { createHmac, timingSafeEqual } from "node:crypto";
import { assert } from "../errors";

/**
 * Production-structured external provider adapters using native fetch & WebCrypto/Node crypto
 * (zero added npm packages). Activated strictly via explicit env configuration;
 * development environments remain isolated and visibly simulated.
 */

export function verifyStripeSignatureHeader(
  rawBody: string,
  header: string | null | undefined,
  webhookSecret: string,
  toleranceSeconds = 300,
  nowMs = Date.now(),
): { valid: boolean; timestamp?: number } {
  if (!header || !webhookSecret) return { valid: false };
  const parts = header.split(",").map((p) => p.trim());
  let timestampStr = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v) timestampStr = v;
    if (k === "v1" && v) signatures.push(v);
  }
  if (!/^\d+$/.test(timestampStr) || signatures.length === 0) return { valid: false };
  const ts = Number(timestampStr);
  const driftSec = Math.abs(Math.floor(nowMs / 1000) - ts);
  if (driftSec > toleranceSeconds) return { valid: false };

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestampStr}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  for (const sig of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(sig)) continue;
    const candidate = Buffer.from(sig, "hex");
    if (candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf)) {
      return { valid: true, timestamp: ts };
    }
  }
  return { valid: false };
}

export async function createStripeCheckoutSession(
  input: {
    amountMinor: bigint;
    advertiserId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const apiKey = process.env.STRIPE_SECRET_KEY ?? "";
  assert(
    apiKey.startsWith("sk_"),
    "STRIPE_NOT_CONFIGURED",
    "STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe.",
    503,
  );
  const body = new URLSearchParams({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": input.amountMinor.toString(),
    "line_items[0][price_data][product_data][name]": "Ruvora Advertiser Campaign Deposit",
    "metadata[advertiserId]": input.advertiserId,
    "metadata[idempotencyKey]": input.idempotencyKey,
  });

  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  assert(
    res.ok && json.id,
    "STRIPE_API_ERROR",
    json.error?.message ?? "Stripe Checkout request failed.",
    502,
  );
  return { sessionId: json.id, checkoutUrl: json.url ?? null };
}

export async function sendEmailViaResend(
  input: { to: string; subject: string; text: string; idempotencyKey: string },
  fetchImpl: typeof fetch = fetch,
) {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "Ruvora Security <no-reply@ruvora.app>";
  assert(
    apiKey.startsWith("re_"),
    "EMAIL_PROVIDER_NOT_CONFIGURED",
    "RESEND_API_KEY is required when EMAIL_PROVIDER=resend.",
    503,
  );

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  assert(
    res.ok && json.id,
    "EMAIL_DELIVERY_FAILED",
    json.message ?? "Resend delivery failed.",
    502,
  );
  return { providerReference: json.id };
}
