/** Exact EUR cents. Deliberately distinct from RU micros, XP and Event Points. */
export type Money = bigint;
/** One RU is 1,000,000 micros. RU never has a fixed monetary exchange rate. */
export type RewardUnits = bigint;
export const RU_SCALE = 1_000_000n;
export const BASIS_POINTS = 10_000n;
export const CATEGORIES = ["USER", "CREATOR", "ADVERTISER", "REFERRAL"] as const;
export type ParticipantCategory = (typeof CATEGORIES)[number];
export type ActivityType =
  | "IMPRESSION"
  | "QUALIFIED_VIEW"
  | "CLICK"
  | "CONVERSION"
  | "CREATOR_PROMOTION"
  | "SPONSORED_MISSION";

export class EconomicError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "EconomicError";
  }
}

export function requireNonnegative(value: bigint, field: string): void {
  if (typeof value !== "bigint" || value < 0n)
    throw new EconomicError("INVALID_AMOUNT", `${field} must be a nonnegative bigint`);
}

export function requireIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new EconomicError("INVALID_IDENTIFIER", field);
}

export function requireSafeCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new EconomicError("INVALID_COUNT", field);
}

export function requireBps(value: number, field: string): void {
  requireSafeCount(value, field);
  if (value > 10_000) throw new EconomicError("INVALID_BASIS_POINTS", field);
}

/** Locale-independent UTF-16 ordering; database callers must use the same tie-break. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/** Stable lossless payload encoding for persisted idempotency checks and snapshots. */
export function canonicalPayload(value: unknown): string {
  if (typeof value === "bigint") return `{"$bigint":${JSON.stringify(value.toString())}}`;
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new EconomicError("UNSAFE_PAYLOAD_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compareIds(a, b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalPayload(v)}`)
      .join(",")}}`;
  }
  throw new EconomicError("UNSUPPORTED_PAYLOAD");
}

export function assertIdempotency(existingPayload: string, incomingPayload: unknown): void {
  if (existingPayload !== canonicalPayload(incomingPayload))
    throw new EconomicError("IDEMPOTENCY_CONFLICT");
}

export function isoInstant(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new EconomicError("INVALID_TIMESTAMP", `${field} must be canonical ISO UTC`);
  return value;
}
