import { createHmac, randomBytes } from "node:crypto";
import { AppError, assert } from "../errors";
import { equalSecret } from "./crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Buffer): string {
  let bits = 0,
    value = 0,
    output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function decodeBase32(secret: string): Buffer {
  assert(/^[A-Z2-7]{16,128}$/.test(secret), "INVALID_TOTP_SECRET", "Invalid authenticator secret.");
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export const createTotpSecret = () => encodeBase32(randomBytes(20));
/** RFC 4226 dynamic truncation; RFC 6238 default SHA-1, 30-second step. */
export function totpCode(secret: string, timeMs = Date.now(), digits = 6): string {
  assert(
    [6, 8].includes(digits) && Number.isSafeInteger(timeMs) && timeMs >= 0,
    "INVALID_TOTP_INPUT",
    "Invalid authenticator input.",
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return (number % 10 ** digits).toString().padStart(digits, "0");
}
export function verifyTotp(
  secret: string,
  code: string,
  lastAcceptedCounter: bigint,
  timeMs = Date.now(),
): bigint {
  assert(/^\d{6}$/.test(code), "INVALID_MFA_CODE", "The authenticator code is invalid.", 401);
  const current = BigInt(Math.floor(timeMs / 30_000));
  // One step of network/clock tolerance, while rejecting every consumed counter.
  for (const counter of [current, current - 1n, current + 1n]) {
    if (
      counter >= 0n &&
      counter > lastAcceptedCounter &&
      equalSecret(totpCode(secret, Number(counter) * 30_000), code)
    )
      return counter;
  }
  throw new AppError(
    "INVALID_MFA_CODE",
    "The authenticator code is invalid or was already used.",
    401,
  );
}
