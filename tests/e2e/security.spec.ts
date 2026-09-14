import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { en } from "../../src/i18n/messages";
import { totpCode } from "../../src/server/security/totp";
import { errorMessage } from "../../src/i18n/errors";

// Enrollment/recovery surfaces contain temporary credentials. Never capture their artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(180000);
// Playwright 1.63 reads this before capturing its AI failure DOM snapshot.
test.beforeEach(() => {
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
});
const contexts: BrowserContext[] = [];
test.afterEach(async ({ page }) => {
  for (const current of [page.context(), ...contexts]) {
    for (const tab of current.pages()) {
      await tab
        .evaluate(() => {
          document.querySelectorAll("input").forEach((input) => {
            input.value = "";
            input.setAttribute("value", "");
          });
          document.querySelectorAll(".recovery-codes pre").forEach((element) => {
            element.textContent = "[redacted]";
          });
          document
            .querySelectorAll('a[href*="#token="]')
            .forEach((link) => link.removeAttribute("href"));
          history.replaceState(null, "", location.pathname);
        })
        .catch(() => undefined);
    }
  }
  for (const context of contexts.splice(0)) await context.close();
});
async function signup(page: Page) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10),
    email = "security-" + suffix + "@browser.test",
    password = "Security-Browser-" + suffix + "!";
  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill("Security Browser");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="role"][value="USER"]').check();
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.locator('input[name="handle"]').fill("security_" + suffix);
  await page.locator('input[name="country"]').fill("FR");
  await page.locator('textarea[name="bio"]').fill("Private browser security fixture.");
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await expect(page).toHaveURL(/app$/);
  return { email, password };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: en.login, exact: true }).click();
}
function panel(page: Page, heading: string) {
  return page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
}
async function post(page: Page, path: string, action: () => Promise<void>) {
  const received = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api" + path && response.request().method() === "POST",
  );
  await action();
  return received;
}
async function openMail(page: Page, heading: string) {
  await page.getByText(en.p2DevInbox, { exact: true }).click();
  await page.getByRole("button", { name: en.p2OpenMail, exact: true }).click();
  const mail = page
    .locator("article.mail-item")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .first();
  await mail.getByRole("link", { name: en.p2OpenMail, exact: true }).click();
}

test("security: real signup, private email verification, one-use MFA enrollment and step-up replay", async ({
  page,
}) => {
  const user = await signup(page);
  await page.goto("/app/security");
  await expect(
    page.getByRole("heading", { name: en.p2AccountSecurity, exact: true }),
  ).toBeVisible();
  const queued = await post(page, "/security/email/request", () =>
    page.getByRole("button", { name: en.p2SendVerification }).click(),
  );
  expect(queued.status()).toBe(200);
  await openMail(page, en.p2EmailVerification);
  await expect(page).toHaveURL(/verify-email$/);
  expect(new URL(page.url()).hash).toBe("");
  await expect(
    page.getByRole("button", { name: en.p2EmailVerification, exact: true }),
  ).toBeEnabled();
  const verified = await post(page, "/security/email/redeem", () =>
    page.getByRole("button", { name: en.p2EmailVerification, exact: true }).click(),
  );
  expect(verified.status()).toBe(200);
  await expect(page.getByRole("status")).toContainText(en.p2VerificationComplete);
  const reused = await post(page, "/security/email/redeem", () =>
    page.getByRole("button", { name: en.p2EmailVerification, exact: true }).click(),
  );
  expect(reused.status()).toBe(400);
  await page.goto("/app/security");
  await expect(panel(page, en.p2EmailVerification)).toContainText(en.p2EmailVerified);
  const authenticator = panel(page, en.p2Authenticator);
  await authenticator.locator('input[name="password"]').fill(user.password);
  const beginning = await post(page, "/security/mfa/begin", () =>
    authenticator.getByRole("button", { name: en.p2BeginMfa }).click(),
  );
  expect(beginning.status()).toBe(200);
  const secret = await authenticator.getByLabel(en.p2MfaSecret, { exact: true }).inputValue();
  const code = totpCode(secret);
  await authenticator.locator('input[name="code"]').fill(code);
  const confirmed = await post(page, "/security/mfa/confirm", () =>
    authenticator.getByRole("button", { name: en.p2ConfirmMfa }).click(),
  );
  expect(confirmed.status()).toBe(200);
  await expect(authenticator).toContainText(en.p2MfaEnabled);
  expect((await page.locator(".recovery-codes pre").textContent())?.split("\n").length).toBe(10);
  const elevated = panel(page, en.p2StepUp);
  await elevated.locator('input[name="password"]').fill(user.password);
  await elevated.locator('input[name="code"]').fill(code);
  const replay = await post(page, "/security/mfa/step-up", () =>
    elevated.getByRole("button", { name: en.p2StepUp, exact: true }).click(),
  );
  expect(replay.status()).toBe(401);
  await expect(page.locator('.notice[role="alert"]')).toContainText(
    errorMessage("INVALID_MFA_CODE", "en"),
  );
  // Exercise the supported next-step tolerance without resetting the persisted counter.
  await elevated.locator('input[name="code"]').fill(totpCode(secret, Date.now() + 30000));
  const fresh = await post(page, "/security/mfa/step-up", () =>
    elevated.getByRole("button", { name: en.p2StepUp, exact: true }).click(),
  );
  expect(fresh.status()).toBe(200);
  await expect(page.getByRole("status")).toContainText(en.p2StepUpSuccess);
  const state = await (await page.request.get("/api/security")).json();
  expect(state.emailVerified).toBe(true);
  expect(state.mfaEnabled).toBe(true);
  expect(Boolean(state.freshUntil)).toBe(true);
});

test("security: logged-out password recovery invalidates sessions and explicit sign-out revokes all", async ({
  page,
  browser,
}) => {
  const user = await signup(page),
    origin = new URL(page.url()).origin;
  const otherContext = await browser.newContext({ baseURL: origin, reducedMotion: "reduce" });
  contexts.push(otherContext);
  const other = await otherContext.newPage();
  await login(other, user.email, user.password);
  await expect(other).toHaveURL(/app$/);
  const anonymousContext = await browser.newContext({ baseURL: origin });
  contexts.push(anonymousContext);
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto("/forgot-password");
  await anonymous.locator('input[name="email"]').fill(user.email);
  const requested = await post(anonymous, "/security/password/request", () =>
    anonymous.getByRole("button", { name: en.p2RequestReset }).click(),
  );
  expect(requested.status()).toBe(200);
  await page.goto("/app/security");
  await openMail(page, en.p2ResetPassword);
  await expect(page).toHaveURL(/reset-password$/);
  await expect(page.getByRole("button", { name: en.p2ResetPassword, exact: true })).toBeEnabled();
  const changed = user.password + "-changed";
  await page.locator('input[name="password"]').fill(changed);
  const reset = await post(page, "/security/password/reset", () =>
    page.getByRole("button", { name: en.p2ResetPassword, exact: true }).click(),
  );
  expect(reset.status()).toBe(200);
  await expect(page.getByRole("status")).toContainText(en.p2ResetComplete);
  expect((await (await other.request.get("/api/session")).json()).user).toBeNull();
  expect((await (await page.request.get("/api/session")).json()).user).toBeNull();
  const reused = await post(page, "/security/password/reset", () =>
    page.getByRole("button", { name: en.p2ResetPassword, exact: true }).click(),
  );
  expect(reused.status()).toBe(400);
  await login(other, user.email, user.password);
  await expect(other.locator('.notice[role="alert"]')).toContainText(
    errorMessage("INVALID_CREDENTIALS", "en"),
  );
  await login(page, user.email, changed);
  await expect(page).toHaveURL(/app$/);
  await login(other, user.email, changed);
  await expect(other).toHaveURL(/app$/);
  await page.goto("/app/security");
  const sessions = panel(page, en.p2Sessions);
  await expect(sessions).toContainText(en.p2OtherSession);
  await sessions.locator('input[name="password"]').fill(changed);
  const revoked = await post(page, "/security/sessions/revoke", () =>
    sessions.getByRole("button", { name: en.p2RevokeSessions }).click(),
  );
  expect(revoked.status()).toBe(200);
  await expect(page).toHaveURL(/login$/);
  expect((await (await page.request.get("/api/session")).json()).user).toBeNull();
  expect((await (await other.request.get("/api/session")).json()).user).toBeNull();
});
