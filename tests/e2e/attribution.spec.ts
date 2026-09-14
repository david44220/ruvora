import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { en } from "../../src/i18n/messages";

type Summary = {
  creatorRuMicros: string;
  pendingCreatorRuMicros: string;
  moneyAllocatedMinor: string;
  profileViews: number;
  registrations: number;
  validatedActions: number;
  campaignStarts: number;
  pendingActivities: number;
};
async function post(api: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await api.post(`/api${path}`, { headers: { Origin: origin }, data });
  expect(response.status(), `POST ${path}`).toBeLessThan(300);
  return response.json();
}
async function signup(page: Page, key: string, role: "USER" | "CREATOR", navigate = true) {
  if (navigate) await page.goto("/register");
  await page.locator('input[name="displayName"]').fill(`Attribution ${key}`);
  await page.locator('input[name="email"]').fill(`${key}@browser.test`);
  await page.locator('input[name="password"]').fill(`Browser-only-${key}!`);
  await page.locator(`input[name="role"][value="${role}"]`).check();
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.locator('input[name="handle"]').fill(key);
  await page.locator('input[name="country"]').fill("FR");
  await page
    .locator('textarea[name="bio"]')
    .fill("Independent creator attribution browser fixture.");
  if (role === "CREATOR") {
    await page.locator('input[name="socialUrl"]').fill("https://example.com/creator");
    await page.locator('input[name="followers"]').fill("50");
  }
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:[/?].*)?$/);
  const response = await page.request.get("/api/session");
  expect(response.status()).toBe(200);
  return (await response.json()).user as { id: string; handle: string };
}
async function analytics(page: Page): Promise<{ summary: Summary }> {
  const response = await page.request.get("/api/analytics/creator");
  expect(response.status()).toBe(200);
  return response.json();
}

test("creator profile acquires an account and earns only after independent billable validation", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const origin = testInfo.project.use.baseURL as string;
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Seed local demo accounts with an explicit DEMO_PASSWORD before browser verification.",
    );
  const tag = randomUUID().replaceAll("-", "").slice(0, 9);
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const newPage = async () => {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return page;
  };
  const creatorPage = await newPage(),
    visitorPage = await newPage(),
    adminPage = await newPage(),
    advertiserPage = await newPage();
  try {
    const creator = await signup(creatorPage, `attr_c_${tag}`, "CREATOR");
    await post(advertiserPage.request, origin, "/auth/login", {
      email: "studio@ruvora.test",
      password,
    });
    await post(adminPage.request, origin, "/auth/login", { email: "admin@ruvora.test", password });
    const name = `Creator attribution campaign ${tag}`;
    const created = await post(advertiserPage.request, origin, "/campaigns", {
      name,
      description: "A funded independently reviewed creator opportunity.",
      objective: "QUALIFIED_VIEW",
      destinationUrl: "https://example.com/attribution",
      budgetMinor: "1000",
      dailyBudgetMinor: "1000",
      unitCostMinor: "25",
      startAt: new Date(Date.now() - 300000).toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      frequencyCap: 3,
    });
    const campaignId = created.campaign.id as string;
    await post(advertiserPage.request, origin, `/campaigns/${campaignId}/fund`, {
      amountMinor: "1000",
      source: "DEVELOPMENT",
      idempotencyKey: `browser-attr:${tag}:fund`,
    });
    await post(advertiserPage.request, origin, `/campaigns/${campaignId}/submit`, {});
    await post(adminPage.request, origin, `/admin/campaigns/${campaignId}/review`, {
      decision: "APPROVE",
      reason: "Independent review of the clearly simulated browser campaign.",
    });
    const baseline = (await analytics(creatorPage)).summary;

    await test.step("public profile visit issues private cookies and preserves the opportunity through onboarding", async () => {
      const captured = visitorPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/attribution/start" &&
          response.request().method() === "POST",
      );
      await visitorPage.goto(`/@${creator.handle}`);
      expect((await captured).status()).toBe(200);
      await expect(visitorPage.getByRole("heading", { level: 1 })).toHaveText(
        `Attribution attr_c_${tag}`,
      );
      const attributionCookies = (await visitorPage.context().cookies()).filter((cookie) =>
        ["ruvora_attribution", "ruvora_visitor"].includes(cookie.name),
      );
      expect(attributionCookies.length).toBe(2);
      expect(
        attributionCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"),
      ).toBe(true);
      expect(
        await visitorPage.evaluate(
          () =>
            document.cookie.includes("ruvora_attribution") ||
            document.cookie.includes("ruvora_visitor"),
        ),
      ).toBe(false);
      const featured = visitorPage
        .locator("article.profile-opportunity")
        .filter({ has: visitorPage.getByRole("heading", { name, exact: true }) });
      await expect(featured).toBeVisible();
      await featured.getByRole("link", { name: en.p2ExploreOpportunity, exact: true }).click();
      await expect(visitorPage).toHaveURL(/\/register$/);
      await signup(visitorPage, `attr_u_${tag}`, "USER", false);
      await expect(visitorPage).toHaveURL(
        new RegExp(`/app/opportunities\\?campaign=${campaignId}$`),
      );
    });
    const afterVisit = (await analytics(creatorPage)).summary;
    expect(afterVisit.profileViews).toBe(baseline.profileViews + 1);
    expect(afterVisit.registrations).toBe(baseline.registrations + 1);
    expect(afterVisit.campaignStarts).toBe(baseline.campaignStarts + 1);
    expect(afterVisit.creatorRuMicros).toBe(baseline.creatorRuMicros);
    expect(afterVisit.moneyAllocatedMinor).toBe(baseline.moneyAllocatedMinor);

    const evidence = `Creator attribution evidence ${tag}: reviewed the independent design story.`;
    const card = visitorPage
      .locator("article.campaign-card")
      .filter({ has: visitorPage.getByRole("heading", { name, exact: true }) });
    await card.locator('textarea[name="evidence"]').fill(evidence);
    const request = visitorPage.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/api/activities" && request.method() === "POST",
    );
    const response = visitorPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/activities" &&
        response.request().method() === "POST",
    );
    await card.getByRole("button", { name: en.participate, exact: true }).click();
    const body = (await request).postDataJSON();
    expect(Object.keys(body)).not.toContain("creatorHandle");
    expect(Object.keys(body)).not.toContain("creatorId");
    const submitted = await response;
    expect(submitted.status()).toBe(201);
    const activity = (await submitted.json()).activity;
    expect(activity.state).toBe("PENDING_VALIDATION");
    expect(activity.creatorId).toBe(creator.id);
    expect(activity.attributionId).toBeTruthy();
    const pending = (await analytics(creatorPage)).summary;
    expect(pending.pendingActivities).toBe(baseline.pendingActivities + 1);
    expect(pending.creatorRuMicros).toBe(baseline.creatorRuMicros);
    expect(pending.pendingCreatorRuMicros).toBe("0");

    await test.step("independent review creates contribution and analytics without promising money", async () => {
      await adminPage.goto("/admin");
      const review = adminPage.locator("article.review-card").filter({ hasText: evidence });
      await expect(review).toHaveCount(1);
      await review
        .locator("textarea")
        .fill(
          "Independent reviewer confirms supplied development evidence for creator attribution.",
        );
      await review.locator('input[type="checkbox"]').check();
      const approved = adminPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/admin/activities/${activity.id}/review` &&
          response.request().method() === "POST",
      );
      await review.getByRole("button", { name: en.validate, exact: true }).click();
      expect((await approved).status()).toBe(200);
      const final = (await analytics(creatorPage)).summary;
      expect(final.validatedActions).toBe(baseline.validatedActions + 1);
      expect(BigInt(final.creatorRuMicros)).toBeGreaterThan(BigInt(baseline.creatorRuMicros));
      expect(final.moneyAllocatedMinor).toBe(baseline.moneyAllocatedMinor);
      await creatorPage.goto("/app/creator");
      await expect(creatorPage.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        creatorPage
          .locator("article.metric-card")
          .filter({ has: creatorPage.getByRole("heading", { name, exact: true }) }),
      ).toContainText(en.p2Validated);
      await expect(creatorPage.getByText(en.noCashValue, { exact: true }).first()).toBeVisible();
    });
    await creatorPage.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        creatorPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
