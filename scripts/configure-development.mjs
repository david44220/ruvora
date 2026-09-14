import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
function requireDevelopment(environment) {
  if (
    environment.NODE_ENV === "production" ||
    (environment.APP_ENV && environment.APP_ENV !== "development")
  )
    throw Error("Development configuration is unavailable outside development.");
}
requireDevelopment(process.env);
const file = ".env";
let source = readFileSync(existsSync(file) ? file : ".env.example", "utf8");
// Parse the same dotenv syntax as application startup: quotes, whitespace,
// export prefixes, comments and the final value of repeated assignments.
const existing = parse(source);
requireDevelopment(existing);
function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
const defaults = {
  DEMO_PASSWORD: randomBytes(24).toString("base64url"),
  SECURITY_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  DEMO_TOTP_SECRET: base32(randomBytes(20)),
  DEV_WEBHOOK_SECRET: randomBytes(32).toString("base64url"),
  EMAIL_PROVIDER: "development",
  PAYMENT_PROVIDER: "development",
};
const configured = Object.keys(defaults).filter((key) => !existing[key]?.trim());
if (configured.length) {
  // Append only effective unset values. Existing contents and configured values
  // are never rewritten; dotenv's final assignment supplies the new defaults.
  source += "\n# Generated private local development settings\n";
  source += configured.map((key) => key + "=" + defaults[key]).join("\n") + "\n";
  writeFileSync(file, source, { mode: 0o600 });
} else if (!existsSync(file)) {
  writeFileSync(file, source, { mode: 0o600 });
}
chmodSync(file, 0o600);
console.log(
  JSON.stringify({
    file,
    configured,
    existingValuesPreserved: true,
    message:
      "Private values were written only to the ignored .env file. Read DEMO_PASSWORD there for local sign-in.",
  }),
);
