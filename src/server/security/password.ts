import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function deriveScrypt(password: string, salt: string, options?: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, derivedKey: Buffer) => {
      if (error) reject(error);
      else resolve(derivedKey);
    };
    if (options) scryptCallback(password, salt, SCRYPT_KEYLEN, options, callback);
    else scryptCallback(password, salt, SCRYPT_KEYLEN, callback);
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveScrypt(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString("hex")}`;
}

export function passwordNeedsRehash(encoded: string): boolean {
  return !encoded.startsWith(`scrypt2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`);
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length === 6 && parts[0] === "scrypt2") {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4] ?? "";
    const hash = parts[5] ?? "";
    if (
      !Number.isInteger(N) ||
      N < 16384 ||
      N > 131072 ||
      (N & (N - 1)) !== 0 ||
      !Number.isInteger(r) ||
      r < 1 ||
      r > 16 ||
      !Number.isInteger(p) ||
      p < 1 ||
      p > 4 ||
      !/^[a-f0-9]{32}$/.test(salt) ||
      !/^[a-f0-9]{128}$/.test(hash)
    )
      return false;
    const candidate = await deriveScrypt(password, salt, {
      N,
      r,
      p,
      maxmem: Math.max(SCRYPT_MAXMEM, 256 * N * r),
    });
    return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
  }
  const [algorithm, salt, hash] = parts;
  if (
    parts.length !== 3 ||
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(hash ?? "")
  )
    return false;
  const candidate = await deriveScrypt(password, salt);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}
