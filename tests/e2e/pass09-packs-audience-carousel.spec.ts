import { expect, test } from "@playwright/test";
import { en } from "../../src/i18n/messages";

const PASSWORD = "Pass09E2e!2026#Secure";

test("Pass 09: Offer Comparator & Bookmarks, Video Scripts & 3-Slide Carousel PNGs, Multi-Offer /c/[handle]/[slug] Pack, Double Opt-In Audience Capture & Referral Channels", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  // 1. Public /explore: Side-by-side Offer Comparator (works even before login)
  await page.goto("/explore");
  const compareButtons = page.getByRole("button", { name: en.p9CompareAddBtn, exact: true });
  const compareCount = await compareButtons.count();
  expect(compareCount).toBeGreaterThanOrEqual(1);
  await compareButtons.first().click();
  await expect(page.locator(".offer-comparator-panel")).toBeVisible();
  if (compareCount >= 2) {
    await compareButtons.first().click();
  }
  await page.getByRole("button", { name: en.p9CompareClearBtn, exact: true }).click();
  await expect(page.locator(".offer-comparator-panel")).toHaveCount(0);

  // Grab an active campaign ID from /explore
  const offerHref = await page
    .locator('.explore-card-footer a[href^="/offers/"]')
    .first()
    .getAttribute("href");
  expect(offerHref).toBeTruthy();
  const campaignId = offerHref!.split("/").pop()!;

  // 2. Register a fresh creator with onboarding
  const suffix = Math.random().toString(16).slice(2, 8);
  const email = `p9_creator_${suffix}@example.test`;
  const handle = `p9cr_${suffix}`;
  const packSlug = `top-picks-${suffix}`;

  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill("Lina Studio");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await page.waitForURL("**/onboarding", { timeout: 20_000 });

  await page.locator('input[name="handle"]').fill(handle);
  await page.locator('input[name="country"]').fill("FR");
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await page.waitForURL("**/app", { timeout: 20_000 });

  // 3. Save offer on /offers/[id]
  await page.goto(offerHref!);
  await page.getByRole("button", { name: en.p9SaveBtn, exact: true }).click();
  await expect(page.getByRole("button", { name: en.p9SavedBtn, exact: true })).toBeVisible();

  // 4. Open /app/promote?campaign=<id>: verify Video Script tabs, 3-Slide Carousel PNG endpoint, and create Multi-Offer Collection
  await page.goto(`/app/promote?campaign=${encodeURIComponent(campaignId)}`);
  await expect(page.getByRole("heading", { name: en.p9StudioTitle })).toBeVisible();
  await page.getByRole("tab", { name: en.p9ScriptTabReels }).click();
  await expect(page.locator(".p9-beat-card")).toHaveCount(4);

  const carouselPng = await request.get(
    `/share-card/carousel/${encodeURIComponent(handle)}?campaign=${encodeURIComponent(campaignId)}&slide=3&format=portrait&lang=en`,
  );
  expect(carouselPng.status()).toBe(200);
  expect(carouselPng.headers()["content-type"]).toContain("image/png");

  // Create a published multi-offer collection via UI
  await page.getByLabel(en.p9CollectionTitleLabel).fill("My Top Verified Picks");
  await page.getByLabel(en.p9CollectionSlugLabel).fill(packSlug);
  await page.locator(".collections-manager-panel .promote-campaign-picks button").first().click();
  await page.getByRole("button", { name: en.p9CollectionSaveBtn }).click();
  await expect(page.getByText(en.p9CollectionSaved)).toBeVisible();

  // 5. Visit public multi-offer collection /c/[handle]/[slug], check OG PNG, and submit double opt-in audience capture
  const packUrl = `/c/${handle}/${packSlug}`;
  await page.goto(packUrl);
  await expect(page.locator("h1", { hasText: "My Top Verified Picks" })).toBeVisible();
  const ogImg = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImg).toContain(`/share-card/collection/${handle}?collection=${packSlug}`);

  const packOgPng = await request.get(
    `/share-card/collection/${encodeURIComponent(handle)}?collection=${encodeURIComponent(packSlug)}&lang=en`,
  );
  expect(packOgPng.status()).toBe(200);
  expect(packOgPng.headers()["content-type"]).toContain("image/png");

  // Submit double opt-in audience capture form on the public collection page
  await page
    .locator(".audience-capture-card input[type='email']")
    .fill(`fan_${suffix}@example.test`);
  await page.locator(".audience-capture-card input[type='checkbox']").check();
  await page.getByRole("button", { name: en.p9AudienceSubscribeBtn }).click();
  await expect(page.getByText(en.p9AudienceSubscribePending)).toBeVisible();

  // 6. Verify /app/referrals channel-tracked invite switcher & /r/[handle]?channel=tiktok redirect
  await page.goto("/app/referrals");
  await expect(page.getByRole("heading", { name: en.p9ReferralChannelTitle })).toBeVisible();
  const refRedirect = await request.get(`/r/${encodeURIComponent(handle)}?channel=tiktok`, {
    maxRedirects: 0,
  });
  expect([307, 308, 302, 303]).toContain(refRedirect.status());
  expect(refRedirect.headers()["location"]).toMatch(/^\/go\//);

  // 7. Mobile 390x844 horizontal overflow check (0px strictly)
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [packUrl, `/@${handle}`, "/explore", "/app/promote", "/app/referrals"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `Horizontal overflow on ${route} at 390px`).toBeLessThanOrEqual(0);
  }
});
