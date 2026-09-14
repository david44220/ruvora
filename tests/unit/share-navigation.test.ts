import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
const mocks = vi.hoisted(() => ({
  startAttribution: vi.fn(),
  getCurrentUser: vi.fn(),
  isDevelopment: vi.fn(),
  validateRuntimeEnvironment: vi.fn(),
}));
vi.mock("@/server/attribution", () => ({
  ATTRIBUTION_COOKIE: "ruvora_attribution",
  VISITOR_COOKIE: "ruvora_visitor",
  startAttribution: mocks.startAttribution,
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/environment", () => ({
  isDevelopment: mocks.isDevelopment,
  validateRuntimeEnvironment: mocks.validateRuntimeEnvironment,
}));
import { GET } from "../../src/app/go/[slug]/route";
import { AppError } from "../../src/server/errors";
import { shareRecoveryDetails } from "../../src/lib/share-recovery";
import { errorMessage } from "../../src/i18n/errors";

const slug = "Abcdefghijklmnopqrstuv12";
const user = { id: "signed-in-participant" };
const context = (value = slug) => ({ params: Promise.resolve({ slug: value }) });
const request = (value = slug, cookie?: string) =>
  new NextRequest(`https://ruvora.test/go/${encodeURIComponent(value)}`, {
    headers: cookie ? { cookie } : undefined,
  });
const success = (redirectTo = "/@creator") => ({
  attributionToken: "new-attribution-bearer",
  visitorToken: "new-visitor-bearer",
  expiresAt: new Date("2026-10-01T00:00:00Z"),
  redirectTo,
  source: "CREATOR_PROFILE",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.isDevelopment.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.startAttribution.mockResolvedValue(success());
});

describe("share redirect recovery", () => {
  it.each(["invalid", "https://evil.example/", "../register"])(
    "handles malformed slug %s before authentication or attribution",
    async (invalid) => {
      const response = await GET(request(invalid), context(invalid));
      const target = new URL(response.headers.get("location")!);
      expect(response.status).toBe(307);
      expect(target.origin).toBe("https://ruvora.test");
      expect(target.pathname).toBe("/share-unavailable");
      expect(target.searchParams.get("code")).toBe("SHARE_LINK_INVALID");
      expect(target.searchParams.has("retry")).toBe(false);
      expect(mocks.startAttribution).not.toHaveBeenCalled();
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "inactive"])(
    "recovers a %s share link without exposing server details",
    async () => {
      mocks.startAttribution.mockRejectedValue(
        new AppError("SHARE_LINK_INACTIVE", "private owner details", 404),
      );
      const response = await GET(request(), context());
      expect(response.headers.get("location")).toBe(
        "https://ruvora.test/share-unavailable?code=SHARE_LINK_INACTIVE",
      );
      expect(response.headers.get("location")).not.toContain("private");
      expect(response.cookies.getAll()).toEqual([]);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );
  it("gives an authenticated owner a recoverable page without bypassing the self-credit guard", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.startAttribution.mockRejectedValue(
      new AppError("SELF_ATTRIBUTION", "Self credit forbidden", 403),
    );
    const response = await GET(request(), context());
    expect(response.headers.get("location")).toContain("code=SELF_ATTRIBUTION");
    expect(mocks.startAttribution).toHaveBeenCalledExactlyOnceWith(
      slug,
      { attributionToken: undefined, visitorToken: undefined },
      user,
    );
    expect(response.cookies.getAll()).toEqual([]);
  });
  it.each([null, user])(
    "clears a mismatched browser context and offers only the validated original retry (user %j)",
    async (currentUser) => {
      mocks.getCurrentUser.mockResolvedValue(currentUser);
      mocks.isDevelopment.mockReturnValue(false);
      mocks.startAttribution.mockRejectedValue(
        new AppError("ATTRIBUTION_ACCOUNT_MISMATCH", "Bound to a different account", 403),
      );
      const response = await GET(
        request(
          slug,
          "ruvora_attribution=old-secret; ruvora_visitor=visitor-secret; ruvora_return=/events/old; ruvora_session=auth-secret",
        ),
        context(),
      );
      const target = new URL(response.headers.get("location")!);
      expect(target.searchParams.get("retry")).toBe(slug);
      const recovery = shareRecoveryDetails(
        target.searchParams.get("code")!,
        target.searchParams.get("retry")!,
      );
      expect(recovery.retryPath).toBe(`/go/${slug}`);
      expect(
        response.cookies
          .getAll()
          .map((cookie) => cookie.name)
          .sort(),
      ).toEqual(["ruvora_attribution", "ruvora_return", "ruvora_visitor"]);
      for (const cookie of response.cookies.getAll())
        expect(cookie).toMatchObject({
          value: "",
          maxAge: 0,
          expires: new Date(0),
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        });
      expect(response.headers.get("location")).not.toContain("secret");
      expect(mocks.startAttribution).toHaveBeenCalledTimes(1);
      mocks.startAttribution.mockResolvedValue(success());
      const retryResponse = await GET(request(), context());
      expect(retryResponse.headers.get("location")).toBe("https://ruvora.test/@creator");
      expect(mocks.startAttribution).toHaveBeenLastCalledWith(
        slug,
        { attributionToken: undefined, visitorToken: undefined },
        currentUser,
      );
    },
  );
  it.each(["ATTRIBUTION_EXPIRED", "CAMPAIGN_INACTIVE", "EVENT_INACTIVE", "CREATOR_INELIGIBLE"])(
    "handles expected %s failures",
    async (code) => {
      mocks.startAttribution.mockRejectedValue(
        new AppError(code, "Expected unavailable context", 409),
      );
      const response = await GET(request(), context());
      expect(new URL(response.headers.get("location")!).searchParams.get("code")).toBe(code);
    },
  );
  it.each([
    new Error("Database offline"),
    new AppError("POLICY_NOT_CONFIGURED", "Operator configuration missing", 503),
    new AppError("UNEXPECTED_FAILURE", "Unrecognized failure", 400),
    new AppError("CREATOR_INELIGIBLE", "Unexpected server failure", 503),
  ])(
    "does not turn an unknown or infrastructure failure into navigation success (%j)",
    async (failure) => {
      mocks.startAttribution.mockRejectedValue(failure);
      await expect(GET(request(), context())).rejects.toBe(failure);
    },
  );
  it("does not mislabel a service configuration schema failure as an invalid public slug", async () => {
    const parsed = z.object({ version: z.string() }).safeParse({ version: 1 });
    if (parsed.success) throw new Error("Fixture must fail validation");
    mocks.startAttribution.mockRejectedValue(parsed.error);
    await expect(GET(request(), context())).rejects.toBe(parsed.error);
  });
  it("preserves runtime environment failures before any redirect", async () => {
    const failure = new AppError("UNSAFE_ENVIRONMENT", "Unsafe configuration", 503);
    mocks.validateRuntimeEnvironment.mockImplementation(() => {
      throw failure;
    });
    await expect(GET(request("invalid"), context("invalid"))).rejects.toBe(failure);
    expect(mocks.startAttribution).not.toHaveBeenCalled();
  });
});

describe("legitimate share navigation", () => {
  it("sends a signed-in referral visitor to the dashboard and retains the checked context", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.startAttribution.mockResolvedValue({ ...success("/register"), source: "REFERRAL" });
    const response = await GET(request(), context());
    expect(response.headers.get("location")).toBe("https://ruvora.test/app");
    expect(response.cookies.get("ruvora_attribution")?.value).toBe("new-attribution-bearer");
    expect(mocks.startAttribution).toHaveBeenCalledExactlyOnceWith(
      slug,
      { attributionToken: undefined, visitorToken: undefined },
      user,
    );
  });
  it("keeps anonymous referral registration available", async () => {
    mocks.startAttribution.mockResolvedValue({ ...success("/register"), source: "REFERRAL" });
    const response = await GET(request(), context());
    expect(response.headers.get("location")).toBe("https://ruvora.test/register");
  });
  it.each([null, user])(
    "preserves campaign continuation through the appropriate auth state (%j)",
    async (currentUser) => {
      mocks.getCurrentUser.mockResolvedValue(currentUser);
      mocks.startAttribution.mockResolvedValue(success("/app/opportunities?campaign=trusted-id"));
      const response = await GET(request(), context());
      expect(response.headers.get("location")).toBe(
        currentUser
          ? "https://ruvora.test/app/opportunities?campaign=trusted-id"
          : "https://ruvora.test/register",
      );
      expect(response.cookies.get("ruvora_return")?.value).toBe(
        "/app/opportunities?campaign=trusted-id",
      );
      expect(response.cookies.get("ruvora_attribution")).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    },
  );
  it.each(["/@creator", "/events/public-event"])(
    "keeps anonymous public destination %s accessible",
    async (destination) => {
      mocks.startAttribution.mockResolvedValue(success(destination));
      const response = await GET(request(), context());
      expect(response.headers.get("location")).toBe(`https://ruvora.test${destination}`);
    },
  );
});

describe("localized recovery input boundary", () => {
  it.each(["https://evil.example/", "//evil.example", "../login", "javascript:alert(1)"])(
    "rejects arbitrary retry target %s",
    (retry) => {
      expect(shareRecoveryDetails("ATTRIBUTION_ACCOUNT_MISMATCH", retry).retryPath).toBeNull();
    },
  );
  it("allows retry only for account recovery and hides unrecognized error codes", () => {
    expect(shareRecoveryDetails("SELF_ATTRIBUTION", slug).retryPath).toBeNull();
    expect(shareRecoveryDetails("private server information", slug)).toEqual({
      code: "SHARE_LINK_INACTIVE",
      retryPath: null,
    });
  });
  it("provides actionable invalid-link copy in both supported languages", () => {
    expect(errorMessage("SHARE_LINK_INVALID", "en")).toContain("original link");
    expect(errorMessage("SHARE_LINK_INVALID", "fr")).toContain("lien original");
  });
});
