import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/server/security/password";
import { assertOrigin, requireRole, register } from "../../src/server/auth";

describe("authentication and request boundaries", () => {
  it("salts scrypt hashes and verifies only the correct password", async () => {
    const password = "a-long-test-passphrase";
    const [one, two] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(one).not.toBe(two);
    expect(one).not.toContain(password);
    expect(await verifyPassword(password, one)).toBe(true);
    expect(await verifyPassword("wrong-passphrase", one)).toBe(false);
    expect(await verifyPassword(password, "malformed")).toBe(false);
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
