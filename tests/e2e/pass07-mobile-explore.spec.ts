import { expect, test } from "@playwright/test";
import { en } from "../../src/i18n/messages";

const PASSWORD = "Pass07E2e!2026#Secure";

test("Pass 07: PWA manifest, public /explore marketplace & simulator, Creator Media Kit PDF, and 0px mobile overflow with sticky tab bar", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  // 1. PWA Manifest serves valid standalone JSON referencing canonical orb icons
  const manifestRes = await request.get("/manifest.webmanifest");
  expect(manifestRes.status()).toBe(200);
  const manifestJson = (await manifestRes.json()) as {
    display: string;
    start_url: string;
    icons: { src: string }[];
  };
  expect(manifestJson.display).toBe("standalone");
  expect(manifestJson.start_url).toBe("/app/promote");
  expect(manifestJson.icons.some((i) => i.src === "/assets/pwa/icon-192.png")).toBe(true);

  // 2. Public Discovery Marketplace (/explore) loads logged-out with simulator and tabs
  await page.goto("/explore");
  await expect(page.locator(".explore-hero h1")).toBeVisible();
  await expect(page.locator(".explore-simulator")).toBeVisible();

  // Switch between Campaigns and Verified Creators tabs
  const creatorsTab = page.locator('[role="tab"]').nth(1);
  await creatorsTab.click();
  await expect(creatorsTab).toHaveAttribute("aria-selected", "true");

  // Adjust simulator slider and verify live RU output renders cleanly
  const slider = page.locator('.explore-simulator input[type="range"]').first();
  await slider.fill("60");
  await expect(page.locator(".explore-sim-output")).toBeVisible();

  // 3. Creator Media Kit PDF 1.4 endpoint works publicly for seeded @mira
  const pdfRes = await request.get("/api/media-kit/mira");
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
  const pdfBytes = await pdfRes.body();
  expect(pdfBytes.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");

  // 4. Register a fresh user, complete onboarding, verify Mobile Sticky Bottom Tab Bar & 0px overflow at 390px
  const suffix = Math.random().toString(16).slice(2, 8);
  const email = `p7_mobile_${suffix}@example.test`;
  const handle = `p7mob_${suffix}`;

  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill("Leo Mobile");
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

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/explore", "/app/promote", "/@mira", "/app/settings"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `Horizontal overflow on ${route} at 390px`).toBeLessThanOrEqual(0);
    if (route.startsWith("/app")) {
      await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
      await expect(page.locator(".mobile-bottom-nav .mobile-tab")).toHaveCount(5);
    }
  }
});
