import { createHmac } from "node:crypto";
import { assert } from "../errors";
import { equalSecret } from "./crypto";
export function signWebhook(
  provider: string,
  rawBody: Uint8Array,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  assert(
    Buffer.byteLength(secret) >= 32,
    "WEBHOOK_SECRET_REQUIRED",
    "Configure a sufficiently strong webhook secret.",
    503,
  );
  const signature = createHmac("sha256", secret)
    .update(provider + "." + timestamp + ".")
    .update(rawBody)
    .digest("hex");
  return "t=" + timestamp + ",v1=" + signature;
}
export function verifyWebhookSignature(
  provider: string,
  rawBody: Uint8Array,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
) {
  assert(rawBody.byteLength <= 32_768, "BODY_TOO_LARGE", "Webhook exceeds 32 KB.", 413);
  const match = header?.match(/^t=([1-9]\d{0,12}),v1=([a-f0-9]{64})$/);
  assert(match, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid.", 401);
  const timestamp = Number(match[1]);
  assert(
    Number.isSafeInteger(timestamp) && Math.abs(Math.floor(nowMs / 1000) - timestamp) <= 300,
    "WEBHOOK_TIMESTAMP_EXPIRED",
    "Webhook signature timestamp is outside the permitted window.",
    401,
  );
  const expected = signWebhook(provider, rawBody, secret, timestamp);
  assert(
    equalSecret(expected, header!),
    "INVALID_WEBHOOK_SIGNATURE",
    "Webhook signature is invalid.",
    401,
  );
}
