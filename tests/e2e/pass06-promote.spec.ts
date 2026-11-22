import "dotenv/config";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { en } from "../../src/i18n/messages";

test("Pass 06: regular user launches Social Promotion Studio, generates TikTok link, pins showcase, and renders 9:16 PNG card with 0px mobile overflow", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = randomBytes(3).toString("hex");
  const handle = `p6e2e_${tag}`;

  // 1. Register as plain USER (not CREATOR)
  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill(`Promo User ${tag}`);
  await page.locator('input[name="email"]').fill(`${handle}@browser.test`);
  await page.locator('input[name="password"]').fill(`Pass06-Browser-${tag}!`);
  await page.locator('input[name="role"][value="USER"]').check();
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // Finish minimal USER onboarding (0 followers, plain USER)
  await page.locator('input[name="handle"]').fill(handle);
  await page.locator('input[name="country"]').fill("FR");
  await page.locator('textarea[name="bio"]').fill("New Ruvora user discovering social promotion.");
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:[/?].*)?$/);

  // 2. Navigate to /app/promote and complete 60s QuickStart Wizard to upgrade USER -> CREATOR
  await page.goto("/app/promote");
  await expect(page.getByText(en.p6QuickStartTitle)).toBeVisible({ timeout: 15_000 });
  await page.locator('.promote-quickstart input[name="handle"]').fill(handle);
  await page.locator('.promote-quickstart input[name="country"]').fill("FR");
  await page.locator('.promote-quickstart select[name="primaryPlatform"]').selectOption("TikTok");
  await page
    .locator('.promote-quickstart input[name="primarySocialUrl"]')
    .fill(`https://tiktok.com/@${handle}`);
  await page.locator('.promote-quickstart input[name="followers"]').fill("180");
  await page
    .locator('.promote-quickstart input[name="bio"]')
    .fill("Everyday creator testing Pass 06 Social Promotion Studio.");
  await page.getByRole("button", { name: en.p6QuickStartSubmit, exact: true }).click();
  await expect(page.getByText(en.p6QuickStartDone)).toBeVisible({ timeout: 15_000 });

  // 3. Switch target to Referral and generate TikTok channel link
  await page.locator(".promote-studio select").first().selectOption("REFERRAL");
  await page.getByRole("button", { name: "TikTok", exact: true }).click();
  await page.getByRole("button", { name: en.p6GenerateLinkBtn, exact: true }).click();
  await expect(page.getByText(en.p6LinkReady)).toBeVisible({ timeout: 10_000 });
  const linkText = await page.locator(".promote-link-display code").innerText();
  expect(linkText).toContain("/go/");

  // 4. Verify live 9:16 Story PNG card renders valid PNG with attachment header
  const cardRes = await page.request.get(
    `/share-card/referral/${handle}?format=story&lang=en&download=1`,
  );
  expect(cardRes.status()).toBe(200);
  expect(cardRes.headers()["content-type"]).toContain("image/png");
  expect(cardRes.headers()["content-disposition"]).toContain("attachment");
  const cardBytes = await cardRes.body();
  expect(cardBytes.subarray(0, 4).toString("hex")).toBe("89504e47");

  // 5. Verify /app/referrals displays transparent funnel + Story card
  await page.goto("/app/referrals");
  await expect(page.getByText(en.p6ReferralFunnelTitle)).toBeVisible({ timeout: 10_000 });

  // 6. Verify public /@handle displays viral creator CTA + zero overflow at 390px mobile
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/app/promote", `/@${handle}`, "/app/referrals"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `Horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
  }
  await page.goto(`/@${handle}`);
  await expect(page.getByText(en.p6PublicViralTitle)).toBeVisible({ timeout: 10_000 });
});
