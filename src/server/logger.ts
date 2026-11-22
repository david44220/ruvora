/**
 * Structured JSON logger with automatic secret/PII key redaction.
 * Never logs passwords, session tokens, TOTP secrets, recovery codes, or raw webhook keys.
 */

const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "secret",
  "signingkey",
  "sealedsigningkey",
  "secretciphertext",
  "destinationciphertext",
  "authorization",
  "cookie",
  "recoverycode",
  "recoverycodes",
  "totpsecret",
  "apikey",
  "privatekey",
]);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return value.length > 512 ? `${value.slice(0, 512)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export type LogLevel = "info" | "warn" | "error";

export function formatLogEntry(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: "ruvora",
    event,
    ...(sanitizeValue(fields) as Record<string, unknown>),
  });
}

export function logInfo(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST === "true" && process.env.RUVORA_LOG_IN_TESTS !== "true") return;
  console.log(formatLogEntry("info", event, fields));
}

export function logWarn(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST === "true" && process.env.RUVORA_LOG_IN_TESTS !== "true") return;
  console.warn(formatLogEntry("warn", event, fields));
}

export function logError(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST === "true" && process.env.RUVORA_LOG_IN_TESTS !== "true") return;
  console.error(formatLogEntry("error", event, fields));
}
