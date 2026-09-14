import { assert } from "./errors";
import { validateEncryptionKey } from "./security/crypto";
export type AppEnvironment = "development" | "staging" | "production";
export function appEnvironment(): AppEnvironment {
  const configured = process.env.APP_ENV;
  assert(
    !configured || ["development", "staging", "production"].includes(configured),
    "INVALID_ENVIRONMENT",
    "APP_ENV is invalid.",
    503,
  );
  if (process.env.NODE_ENV === "production")
    return configured === "staging" ? "staging" : "production";
  return (configured as AppEnvironment | undefined) ?? "development";
}
export function isDevelopment() {
  return appEnvironment() === "development";
}
export function assertDevelopment(feature: string) {
  assert(isDevelopment(), "DEVELOPMENT_ONLY", feature + " is available only in development.", 403);
}
export function validateRuntimeEnvironment() {
  const environment = appEnvironment();
  if (environment !== "development") {
    assert(
      process.env.ALLOW_DEV_SEED !== "true" &&
        process.env.ALLOW_DEMO_FUNDING !== "true" &&
        !process.env.DEMO_PASSWORD &&
        !process.env.DEMO_TOTP_SECRET &&
        process.env.EMAIL_PROVIDER !== "development" &&
        process.env.PAYMENT_PROVIDER !== "development",
      "UNSAFE_ENVIRONMENT",
      "Development credentials and providers are forbidden here.",
      503,
    );
    const origin = new URL(process.env.APP_URL ?? "http://invalid");
    assert(
      origin.protocol === "https:" && !origin.username && !origin.password,
      "UNSAFE_ENVIRONMENT",
      "An HTTPS application origin is required.",
      503,
    );
    validateEncryptionKey();
  }
  return {
    environment,
    emailProvider: process.env.EMAIL_PROVIDER ?? "disabled",
    paymentProvider: process.env.PAYMENT_PROVIDER ?? "disabled",
  };
}
