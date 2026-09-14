import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError, assert } from "../errors";
export const secretDigest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function validateEncryptionKey() {
  const raw = process.env.SECURITY_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  assert(
    key.length === 32 && key.toString("base64") === raw,
    "SECURITY_KEY_REQUIRED",
    "Configure a 32-byte base64 security encryption key.",
    503,
  );
  return key;
}
/** AES-256-GCM authenticates both ciphertext and its record/purpose binding. */
export function sealSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", validateEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function openSecret(box: string, context: string): string {
  const [version, iv, tag, ciphertext, extra] = box.split(".");
  assert(
    version === "v1" && iv && tag && ciphertext && !extra,
    "INVALID_SECRET_BOX",
    "Encrypted security data is invalid.",
    503,
  );
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      validateEncryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "INVALID_SECRET_BOX",
      "Encrypted security data could not be authenticated.",
      503,
    );
  }
}
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
