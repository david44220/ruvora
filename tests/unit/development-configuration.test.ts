import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parse } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";
const script = resolve("scripts/configure-development.mjs");
const fixtureRoot = resolve(".local", "configuration-tests");
const directories: string[] = [];
function fixture(source: string, exampleOnly = false) {
  mkdirSync(fixtureRoot, { recursive: true });
  const directory = mkdtempSync(join(fixtureRoot, "case-"));
  directories.push(directory);
  writeFileSync(join(directory, exampleOnly ? ".env.example" : ".env"), source);
  return directory;
}
function run(directory: string, environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", APP_ENV: "development", ...environment },
  });
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const absolute = resolve(directory);
    if (!absolute.startsWith(fixtureRoot + sep))
      throw new Error("Fixture cleanup escaped its explicit test directory.");
    rmSync(absolute, { recursive: true, force: true });
  }
});
describe("private development configuration", () => {
  it.each([
    'APP_ENV="production"',
    " APP_ENV = staging # deployment configuration",
    "export APP_ENV='production'",
    "NODE_ENV=production",
    'NODE_ENV = "production"',
    "APP_ENV=development\nAPP_ENV=staging",
  ])("refuses non-development dotenv syntax without modifying the file: %s", (source) => {
    const directory = fixture(source + "\nEMAIL_PROVIDER=disabled\n"),
      before = readFileSync(join(directory, ".env"), "utf8");
    const result = run(directory);
    expect(result.status).not.toBe(0);
    expect(digest(readFileSync(join(directory, ".env"), "utf8"))).toBe(digest(before));
    expect(result.stdout).toBe("");
  });
  it("refuses a production process even when the file declares development", () => {
    const directory = fixture("APP_ENV=development\n"),
      before = readFileSync(join(directory, ".env"), "utf8");
    expect(run(directory, { NODE_ENV: "production" }).status).not.toBe(0);
    expect(digest(readFileSync(join(directory, ".env"), "utf8"))).toBe(digest(before));
  });
  it("preserves configured values and file contents while filling only effective unset values", () => {
    const original =
      "# operator comment\nAPP_ENV='development'\nDEMO_PASSWORD='existing-private-fixture'\nEMAIL_PROVIDER=disabled\nPAYMENT_PROVIDER=disabled\nSECURITY_ENCRYPTION_KEY= # intentionally unset\n";
    const directory = fixture(original),
      result = run(directory);
    expect(result.status).toBe(0);
    const contents = readFileSync(join(directory, ".env"), "utf8"),
      parsed = parse(contents);
    expect(contents.startsWith(original)).toBe(true);
    expect(parsed.DEMO_PASSWORD === "existing-private-fixture").toBe(true);
    expect(parsed.EMAIL_PROVIDER).toBe("disabled");
    expect(parsed.PAYMENT_PROVIDER).toBe("disabled");
    expect(Buffer.from(parsed.SECURITY_ENCRYPTION_KEY, "base64").length).toBe(32);
    expect(/^[A-Z2-7]{32}$/.test(parsed.DEMO_TOTP_SECRET)).toBe(true);
    for (const key of [
      "DEMO_PASSWORD",
      "SECURITY_ENCRYPTION_KEY",
      "DEMO_TOTP_SECRET",
      "DEV_WEBHOOK_SECRET",
    ])
      expect(result.stdout.includes(parsed[key])).toBe(false);
    const repeated = run(directory);
    expect(repeated.status).toBe(0);
    expect(JSON.parse(repeated.stdout).configured).toEqual([]);
    expect(digest(readFileSync(join(directory, ".env"), "utf8"))).toBe(digest(contents));
  });
  it("creates a private local env from the example without printing generated credentials", () => {
    const directory = fixture(
      "APP_ENV=development\nEMAIL_PROVIDER=development\nPAYMENT_PROVIDER=development\n",
      true,
    );
    const result = run(directory);
    expect(result.status).toBe(0);
    const parsed = parse(readFileSync(join(directory, ".env"), "utf8"));
    expect(JSON.parse(result.stdout).configured).toContain("SECURITY_ENCRYPTION_KEY");
    for (const key of [
      "DEMO_PASSWORD",
      "SECURITY_ENCRYPTION_KEY",
      "DEMO_TOTP_SECRET",
      "DEV_WEBHOOK_SECRET",
    ])
      expect(result.stdout.includes(parsed[key])).toBe(false);
  });
});
