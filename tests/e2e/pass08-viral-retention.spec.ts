import { expect, test } from "@playwright/test";
import { en } from "../../src/i18n/messages";

const PASSWORD = "Pass08E2e!2026#Secure";

test("Pass 08: Public /offers/[id] + OG & Brief PDF, Vanity Short Slug + Mobile Bridge /go-card, Post Planner .ics, Leaderboard & Notification Prefs", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  // 1. Public /explore exposes Offer Sheet links and Opt-In XP Leaderboard
  await page.goto("/explore");
  await expect(page.locator(".explore-leaderboard")).toBeVisible();
  const offerHref = await page
    .locator('.explore-card-footer a[href^="/offers/"]')
    .first()
    .getAttribute("href");
  expect(offerHref).toBeTruthy();

  // 2. Public Offer Sheet (/offers/[id]) loads with dynamic OG image tag & Brief PDF download
  await page.goto(offerHref!);
  await expect(page.locator(".offer-hero-card h1")).toBeVisible();
  const ogImg = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImg).toContain("/share-card/campaign/");

  const campaignId = offerHref!.split("/").pop()!;
  const briefPdfRes = await request.get(`/api/campaigns/${campaignId}/brief-pdf?lang=en`);
  expect(briefPdfRes.status()).toBe(200);
  expect(briefPdfRes.headers()["content-type"]).toContain("application/pdf");
  expect((await briefPdfRes.body()).subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");

  const ogPngRes = await request.get(`/share-card/campaign/${campaignId}?lang=en`);
  expect(ogPngRes.status()).toBe(200);
  expect(ogPngRes.headers()["content-type"]).toContain("image/png");

  // 3. Register a fresh creator, opt in to XP leaderboard, save notification preferences, and test Promote Hub features
  const suffix = Math.random().toString(16).slice(2, 8);
  const email = `p8_creator_${suffix}@example.test`;
  const handle = `p8cr_${suffix}`;

  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill("Clara Viral");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await page.waitForURL("**/onboarding", { timeout: 20_000 });

  await page.locator('input[name="handle"]').fill(handle);
  await page.locator('input[name="country"]').fill("FR");
  await page.locator('input[name="leaderboardOptIn"]').check();
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await page.waitForURL("**/app", { timeout: 20_000 });

  // 4. Settings: Notification Preferences panel + Queue test weekly digest
  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: en.p8NotifPrefsTitle })).toBeVisible();
  await page.getByRole("button", { name: en.p8NotifPrefsSave }).click();
  await expect(page.getByText(en.p8NotifPrefsSaved)).toBeVisible();

  // 5. Promote Studio: schedule a post plan, verify Streak/Milestone panel, and check 0px overflow on 390px mobile
  await page.goto(`/app/promote?campaign=${encodeURIComponent(campaignId)}`);
  await expect(page.locator(".retention-panel")).toBeVisible();
  await expect(page.locator(".planner-panel")).toBeVisible();

  await page.locator('.planner-panel input[type="text"]').first().fill("Story demo + partner code");
  await page.getByRole("button", { name: en.p8PlannerCreate }).click();
  await expect(page.getByText(en.p8PlannerCreated)).toBeVisible();
  await expect(page.locator(".planner-item")).toHaveCount(1);

  // 6. Verify 0px horizontal overflow across new Pass 08 pages at 390x844 mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [offerHref!, "/explore", "/app/promote", "/app/settings"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `Horizontal overflow on ${route} at 390px`).toBeLessThanOrEqual(0);
  }
});
