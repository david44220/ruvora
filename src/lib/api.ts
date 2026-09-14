export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error?.code ?? "REQUEST_FAILED", response.status);
  return result as T;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
function exactInteger(value: string | number | bigint): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new RangeError(
      "Amounts must be safe integers; use a bigint or integer string for larger values.",
    );
  if (typeof value === "string" && !/^-?\d+$/.test(value))
    throw new RangeError("Amounts must be integer strings.");
  return BigInt(value);
}

/** Lossless display of EUR cents; never convert monetary amounts to floating point. */
export function minorMoney(value: string | number | bigint = "0", locale = "en") {
  const n = exactInteger(value);
  const sign = n < 0n ? "-" : "";
  const absolute = n < 0n ? -n : n;
  const whole = (absolute / 100n).toLocaleString(locale);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${locale === "fr" ? "" : "€"}${whole}${locale === "fr" ? "," : "."}${fraction}${locale === "fr" ? " €" : ""}`;
}

/** RU precision is six decimals; negative corrections retain their sign below one RU. */
export function ruNumber(value: string | number | bigint = "0", locale = "en") {
  const n = exactInteger(value);
  const sign = n < 0n ? "-" : "";
  const absolute = n < 0n ? -n : n;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${(absolute / 1_000_000n).toLocaleString(locale)}${fraction ? (locale === "fr" ? "," : ".") + fraction : ""}`;
}
