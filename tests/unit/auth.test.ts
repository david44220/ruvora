import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../../src/server/security/password";
import { assertOrigin, clientIp, requireRole, register } from "../../src/server/auth";
import { safeUrl } from "../../src/server/validation";

describe("authentication and request boundaries", () => {
  it("salts scrypt2 hashes, verifies legacy scrypt hashes, and flags rehash need", async () => {
    const password = "a-long-test-passphrase";
    const [one, two] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(one).not.toBe(two);
    expect(one.startsWith("scrypt2$32768$8$1$")).toBe(true);
    expect(passwordNeedsRehash(one)).toBe(false);
    expect(one).not.toContain(password);
    expect(await verifyPassword(password, one)).toBe(true);
    expect(await verifyPassword("wrong-passphrase", one)).toBe(false);
    expect(await verifyPassword(password, "malformed")).toBe(false);
    const legacySalt = "0123456789abcdef0123456789abcdef";
    const legacyHash = `scrypt$${legacySalt}$${scryptSync(password, legacySalt, 64).toString("hex")}`;
    expect(passwordNeedsRehash(legacyHash)).toBe(true);
    expect(await verifyPassword(password, legacyHash)).toBe(true);
    expect(await verifyPassword("wrong-passphrase", legacyHash)).toBe(false);
  });
  it("extracts normalized client IP headers safely", () => {
    expect(
      clientIp(
        new Request("https://ruvora.example", {
          headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
        }),
      ),
    ).toBe("203.0.113.42");
    expect(
      clientIp(new Request("https://ruvora.example", { headers: { "x-real-ip": "2001:db8::1" } })),
    ).toBe("2001:db8::1");
    expect(
      clientIp(
        new Request("https://ruvora.example", { headers: { "x-forwarded-for": "bad value!" } }),
      ),
    ).toBe("loopback");
    expect(clientIp(new Request("https://ruvora.example"))).toBe("loopback");
  });
  it("rejects loopback, private, link-local and internal hosts in safeUrl", () => {
    expect(safeUrl.safeParse("https://example.com/campaign").success).toBe(true);
    for (const blocked of [
      "https://localhost/admin",
      "https://sub.localhost/test",
      "https://127.0.0.1/internal",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1/private",
      "https://172.16.4.2/private",
      "https://192.168.1.10/router",
      "https://[::1]/loopback",
      "https://service.internal/api",
      "http://example.com/insecure",
    ]) {
      expect(safeUrl.safeParse(blocked).success, blocked).toBe(false);
    }
  });
  it("authorizes combinations of roles without treating creator as administrator", () => {
    expect(() =>
      requireRole({ roles: ["USER", "CREATOR", "ADVERTISER"] }, "ADVERTISER"),
    ).not.toThrow();
    expect(() => requireRole({ roles: ["USER", "CREATOR", "ADVERTISER"] }, "ADMIN")).toThrow();
  });
  it("refuses ADMIN or injected roles during public signup before database work", async () => {
    await expect(
      register({
        email: "privilege@test.example",
        password: "a-long-test-passphrase",
        displayName: "Test",
        role: "ADMIN",
      }),
    ).rejects.toThrow();
    await expect(
      register({
        email: "privilege@test.example",
        password: "a-long-test-passphrase",
        displayName: "Test",
        roles: ["ADMIN"],
      }),
    ).rejects.toThrow();
  });
  it("requires the configured same-origin for state changes", () => {
    const origin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
    expect(() =>
      assertOrigin(new Request(`${origin}/api/profile`, { headers: { origin } })),
    ).not.toThrow();
    expect(() => assertOrigin(new Request(`${origin}/api/profile`))).toThrow();
    expect(() =>
      assertOrigin(
        new Request(`${origin}/api/profile`, { headers: { origin: "https://attacker.example" } }),
      ),
    ).toThrow();
    expect(() =>
      assertOrigin(
        new Request(`${origin}/api/profile`, {
          headers: { origin, "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toThrow();
  });
});
