import "dotenv/config";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { en, fr } from "../../src/i18n/messages";

type Role = "USER" | "CREATOR" | "ADVERTISER";
type Campaign = { id: string; name: string; eventId?: string | null; canParticipate: boolean };
type Activity = { id: string; eventId?: string | null };
type Dashboard = {
  user: { id: string; roles: string[] };
  summary: {
    ruMicros: string;
    xp: number;
    eventPoints: number;
    moneyMinor: string;
    pendingActivities: number;
  };
  rewardUnits: { category: string; state: string; _sum: { amountMicros: string } }[];
};
async function dashboard(page: Page): Promise<Dashboard> {
  const response = await page.request.get("/api/dashboard");
  expect(response.status()).toBe(200);
  return response.json();
}
async function createAccount(page: Page, role: Role, suffix: string, name: string) {
  const email = role.toLowerCase() + "-" + suffix + "@browser.test";
  const password = "Browser-fixture-" + suffix + "!";
  const handle = "e2e_" + role.slice(0, 1).toLowerCase() + "_" + suffix;
  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="role"][value="' + role + '"]').check();
  await page.getByRole("button", { name: en.continue, exact: true }).click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.locator('input[name="handle"]').fill(handle);
  await page.locator('input[name="country"]').fill("FR");
  await page.locator('textarea[name="bio"]').fill("A browser-tested independent community.");
  if (role === "CREATOR") {
    await page.locator('input[name="socialUrl"]').fill("https://example.com/creator");
    await page.locator('input[name="followers"]').fill("42");
  }
  await page.locator('input[name="adult"]').check();
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: en.saveProfile, exact: true }).click();
  await expect(page).toHaveURL(/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(en.greeting);
  const snapshot = await dashboard(page);
  expect(snapshot.user.roles).toContain(role);
  return { email, password, handle, name, id: snapshot.user.id };
}
async function login(page: Page, email: string, password: string, french = false) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: french ? fr.login : en.login, exact: true }).click();
  await expect(page).toHaveURL(/app$/);
}
function cardFor(page: Page, name: string) {
  return page
    .locator("article.campaign-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function postFromUI(page: Page, path: string, action: () => Promise<void>) {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api" + path && response.request().method() === "POST",
  );
  await action();
  const response = await pending;
  expect(response.status(), "POST /api" + path + " should succeed").toBeLessThan(300);
  return response.json();
}
async function submitOpportunity(
  page: Page,
  campaign: Campaign,
  evidence: string,
): Promise<Activity> {
  const card = cardFor(page, campaign.name);
  await expect(card).toBeVisible();
  await card.locator('textarea[name="evidence"]').fill(evidence);
  const result = await postFromUI(page, "/activities", () =>
    card.getByRole("button", { name: en.participate, exact: true }).click(),
  );
  expect(result.activity.state).toBe("PENDING_VALIDATION");
  await expect(
    card.getByRole("button", { name: en.statusPENDING_VALIDATION, exact: true }),
  ).toBeDisabled();
  return result.activity;
}
async function reviewThroughUI(page: Page, activity: Activity, evidence: string) {
  const card = page.locator("article.review-card").filter({ hasText: evidence });
  await expect(card).toHaveCount(1);
  await card
    .locator("textarea")
    .fill("Independent browser review confirms the supplied development evidence.");
  await card.locator('input[type="checkbox"]').check();
  await postFromUI(page, "/admin/activities/" + activity.id + "/review", () =>
    card.getByRole("button", { name: en.validate, exact: true }).click(),
  );
  await expect(card).toHaveCount(0);
}
function statValue(page: Page, label: string) {
  return page
    .locator("article.stat-card")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator(".stat-value");
}

test("real user, creator, advertiser and independent admin browser journey", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12)
    throw new Error(
      "Seed the local test database and supply DEMO_PASSWORD before browser journeys.",
    );
  const suffix = randomUUID().replaceAll("-", "").slice(0, 9);
  const baseURL = testInfo.project.use.baseURL as string;
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const newPage = async () => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
      timezoneId: "UTC",
      reducedMotion: "reduce",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return page;
  };
  const participantPage = await newPage(),
    creatorPage = await newPage(),
    advertiserPage = await newPage(),
    adminPage = await newPage();
  try {
    const participant = await createAccount(
      participantPage,
      "USER",
      suffix,
      "Browser Participant " + suffix,
    );
    const creator = await createAccount(
      creatorPage,
      "CREATOR",
      suffix,
      "Browser Creator " + suffix,
    );
    await createAccount(advertiserPage, "ADVERTISER", suffix, "Browser Advertiser " + suffix);

    await test.step("creator edits a profile and publishes the unique Ruvora Link", async () => {
      await creatorPage.goto("/app/settings");
      await creatorPage
        .locator('textarea[name="bio"]')
        .fill("Independent creator journal " + suffix + ".");
      await creatorPage.locator('input[name="linkTitle"]').fill("Studio journal " + suffix);
      await creatorPage.locator('input[name="linkUrl"]').fill("https://example.com/studio");
      await creatorPage.getByRole("button", { name: en.saveProfile, exact: true }).click();
      await expect(creatorPage.getByRole("status")).toContainText(en.saved);
      await creatorPage.goto("/@" + creator.handle);
      await expect(creatorPage.getByRole("heading", { level: 1 })).toHaveText(creator.name);
      await expect(
        creatorPage.getByText("Independent creator journal " + suffix + ".", { exact: true }),
      ).toBeVisible();
      await expect(
        creatorPage.getByRole("link", { name: "Studio journal " + suffix, exact: true }),
      ).toHaveAttribute("href", "https://example.com/studio");
      await expect(creatorPage.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp("/@" + creator.handle + "$"),
      );
      await creatorPage.goto("/app/creator");
      await expect(creatorPage.getByRole("heading", { level: 1 })).toHaveText(en.creatorStudio);
    });

    let campaign!: Campaign;
    await test.step("advertiser drafts, funds and submits through the application", async () => {
      await advertiserPage.goto("/app/advertiser");
      await advertiserPage.getByRole("button", { name: en.createCampaign, exact: true }).click();
      await advertiserPage.locator('input[name="name"]').fill("Browser campaign " + suffix);
      await advertiserPage.locator('select[name="objective"]').selectOption("QUALIFIED_VIEW");
      await advertiserPage
        .locator('input[name="destinationUrl"]')
        .fill("https://example.com/campaign");
      await advertiserPage.locator('input[name="budgetMinor"]').fill("1000");
      await advertiserPage.locator('input[name="dailyBudgetMinor"]').fill("100");
      await advertiserPage.locator('input[name="unitCostMinor"]').fill("25");
      await advertiserPage
        .locator('input[name="startAt"]')
        .fill(new Date(Date.now() - 300_000).toISOString().slice(0, 16));
      await advertiserPage
        .locator('input[name="endAt"]')
        .fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
      const created = await postFromUI(advertiserPage, "/campaigns", () =>
        advertiserPage.getByRole("button", { name: en.submitDraft, exact: true }).click(),
      );
      campaign = created.campaign;
      expect(created.campaign.state).toBe("DRAFT");
      const card = cardFor(advertiserPage, campaign.name);
      await postFromUI(advertiserPage, "/campaigns/" + campaign.id + "/fund", () =>
        card.getByRole("button", { name: en.fundDemo, exact: true }).click(),
      );
      expect((await dashboard(advertiserPage)).summary.ruMicros).toBe("0");
      await postFromUI(advertiserPage, "/campaigns/" + campaign.id + "/submit", () =>
        card.getByRole("button", { name: en.submitReview, exact: true }).click(),
      );
      await expect(card).toContainText(en.statusPENDING_REVIEW);
    });

    await login(adminPage, "admin@ruvora.test", demoPassword);
    await adminPage.goto("/admin");
    const snapshot = await (await adminPage.request.get("/api/admin")).json();
    const rate = snapshot.rules.config.reward.rates.QUALIFIED_VIEW as {
      userRuMicros: string;
      advertiserRuMicrosPerMinor: string;
      xp: number;
      eventPoints: number;
    };
    await test.step("independent administrator reviews the advertiser campaign", async () => {
      const card = adminPage
        .locator("article.review-card")
        .filter({ has: adminPage.getByRole("heading", { name: campaign.name, exact: true }) });
      await card
        .locator("textarea")
        .fill("Independent browser review confirms this development campaign is appropriate.");
      await postFromUI(adminPage, "/admin/campaigns/" + campaign.id + "/review", () =>
        card.getByRole("button", { name: en.approve, exact: true }).click(),
      );
      await expect(card).toHaveCount(0);
    });

    const eventResponse = await participantPage.request.get("/api/events/creator-rush");
    expect(eventResponse.status()).toBe(200);
    const eventId = (await eventResponse.json()).event.id as string;
    const evidence = "Browser reviewed the independent campaign story; fixture " + suffix + ".";
    const eventEvidence =
      "Browser reviewed the linked event campaign story; fixture " + suffix + ".";
    let firstActivity!: Activity, eventActivity!: Activity;
    await test.step("participant joins an event and submits pending campaign evidence", async () => {
      await participantPage.goto("/events/creator-rush");
      await participantPage.getByRole("button", { name: en.joinEvent, exact: true }).click();
      await expect(
        participantPage.getByRole("button", { name: en.joined, exact: true }),
      ).toBeDisabled();
      await participantPage.goto("/app/opportunities");
      firstActivity = await submitOpportunity(participantPage, campaign, evidence);
      const listing = (await (await participantPage.request.get("/api/campaigns")).json()) as {
        campaigns: Campaign[];
      };
      const eventCampaign = listing.campaigns.find(
        (item) => item.eventId === eventId && item.canParticipate,
      );
      expect(eventCampaign, "A seeded active event-linked campaign must exist").toBeTruthy();
      eventActivity = await submitOpportunity(participantPage, eventCampaign!, eventEvidence);
      expect(eventActivity.eventId).toBe(eventId);
      const pending = await dashboard(participantPage);
      expect(pending.summary.xp).toBe(0);
      expect(pending.summary.eventPoints).toBe(0);
      expect(pending.summary.ruMicros).toBe("0");
      expect(pending.summary.pendingActivities).toBe(2);
    });

    await test.step("independent validation grants separate advertiser RU, user XP and Event Points", async () => {
      await adminPage.goto("/admin");
      await reviewThroughUI(adminPage, firstActivity, evidence);
      await reviewThroughUI(adminPage, eventActivity, eventEvidence);
      const earned = await dashboard(participantPage);
      expect(BigInt(earned.summary.ruMicros)).toBe(BigInt(rate.userRuMicros) * 2n);
      expect(earned.summary.xp).toBe(rate.xp * 2);
      expect(earned.summary.eventPoints).toBe(rate.eventPoints);
      expect(earned.summary.moneyMinor).toBe("0");
      const advertiser = await dashboard(advertiserPage);
      const units = advertiser.rewardUnits
        .filter((unit) => unit.category === "ADVERTISER" && unit.state === "VALIDATED")
        .reduce((sum, unit) => sum + BigInt(unit._sum.amountMicros), 0n);
      expect(units).toBe(25n * BigInt(rate.advertiserRuMicrosPerMinor));
      await participantPage.goto("/app");
      await expect(statValue(participantPage, en.progression)).toHaveText(String(rate.xp * 2));
      await expect(statValue(participantPage, en.eventPoints)).toHaveText(String(rate.eventPoints));
      await advertiserPage.goto("/app/advertiser");
      await expect(statValue(advertiserPage, en.advertiserRU)).not.toHaveText("0");
      await participantPage.goto("/events/creator-rush");
      const row = participantPage.getByRole("row").filter({ hasText: participant.name });
      await expect(row).toHaveCount(1);
      await expect(row.locator("td").last()).toHaveText(String(rate.eventPoints));
    });

    await test.step("French persists across reload and login; user cannot access administration", async () => {
      await participantPage.goto("/app");
      await participantPage.getByRole("button", { name: en.language, exact: true }).click();
      await expect(participantPage.getByRole("heading", { level: 1 })).toContainText(fr.greeting);
      await expect(statValue(participantPage, fr.eventPoints)).toHaveText(String(rate.eventPoints));
      await participantPage.reload();
      await expect(participantPage.locator("html")).toHaveAttribute("lang", "fr");
      const preference = (await participantPage.context().cookies()).find(
        (cookie) => cookie.name === "ruvora_locale",
      );
      expect(preference?.value).toBe("fr");
      expect(preference?.expires).toBeGreaterThan(Date.now() / 1000 + 350 * 86_400);
      await participantPage.getByRole("button", { name: fr.logout, exact: true }).click();
      await expect(participantPage).toHaveURL(/login$/);
      await expect(participantPage.getByRole("heading", { level: 2 })).toHaveText(fr.login);
      await login(participantPage, participant.email, participant.password, true);
      await expect(participantPage.getByRole("heading", { level: 1 })).toContainText(fr.greeting);
      expect((await participantPage.request.get("/api/admin")).status()).toBe(403);
      await participantPage.goto("/admin");
      await expect(participantPage).toHaveURL(/app$/);
    });
    expect(errors, "Browser runtime errors").toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function assertNoOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const measurement = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const style = getComputedStyle(element),
          bounds = element.getBoundingClientRect();
        return (
          style.position !== "fixed" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.right > document.documentElement.clientWidth + 2
        );
      })
      .slice(0, 8)
      .map((element) => ({ tag: element.tagName, className: element.className })),
  }));
  expect(measurement.document, JSON.stringify(measurement)).toBeLessThanOrEqual(
    measurement.viewport + 2,
  );
  expect(measurement.body, JSON.stringify(measurement)).toBeLessThanOrEqual(
    measurement.viewport + 2,
  );
}
for (const width of [360, 430, 768, 1024, 1440, 1920]) {
  test("homepage has no horizontal overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(en.heroLine1);
    await expect(page.locator(".hero-content .button")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".hero-art img:visible, .hero-mobile-art img:visible")
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await assertNoOverflow(page);
    if (width === 360) {
      const toggle = page.locator("button.menu-toggle");
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.locator("nav.public-nav").getByRole("link", { name: en.navEvents, exact: true }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
  test("public profile has no horizontal overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/@mira");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mira Laurent");
    await expect(page.getByText("@mira", { exact: true })).toBeVisible();
    await expect(page.locator(".public-profile")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".public-profile-cover img")
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await assertNoOverflow(page);
  });
}

test("profile edits preserve both existing socials and links through add and remove", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12)
    throw new Error("Supply the local seed DEMO_PASSWORD before browser journeys.");
  await login(page, "mira@ruvora.test", demoPassword);
  const response = await page.request.get("/api/dashboard");
  expect(response.status()).toBe(200);
  const { user: original } = (await response.json()) as {
    user: {
      handle: string;
      displayName: string;
      bio: string | null;
      category: string | null;
      country: string;
      locale: string;
      roles: string[];
      socialLinks: { platform: string; url: string; followers: number }[];
      customLinks: { title: string; url: string }[];
    };
  };
  expect(original.socialLinks).toHaveLength(2);
  expect(original.customLinks).toHaveLength(2);
  let restoreNeeded = false;
  const save = () =>
    postFromUI(page, "/profile", () =>
      page.getByRole("button", { name: en.saveProfile, exact: true }).click(),
    );
  const assertOriginalRows = async () => {
    await expect(page.locator('input[name^="socialUrl"]')).toHaveCount(2);
    await expect(page.locator('input[name^="linkUrl"]')).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
      const suffix = index === 0 ? "" : "-" + index;
      await expect(page.locator('input[name="socialUrl' + suffix + '"]')).toHaveValue(
        original.socialLinks[index].url,
      );
      await expect(page.locator('input[name="linkUrl' + suffix + '"]')).toHaveValue(
        original.customLinks[index].url,
      );
      await expect(page.locator('input[name="linkTitle' + suffix + '"]')).toHaveValue(
        original.customLinks[index].title,
      );
    }
  };
  try {
    await page.goto("/app/settings");
    await assertOriginalRows();
    const bio = "Profile persistence browser regression " + randomUUID().slice(0, 8) + ".";
    await page.locator('textarea[name="bio"]').fill(bio);
    restoreNeeded = true;
    const edited = await save();
    expect(edited.user.bio).toBe(bio);
    expect(edited.user.socialLinks).toEqual(original.socialLinks);
    expect(edited.user.customLinks).toEqual(original.customLinks);
    await page.reload();
    await assertOriginalRows();
    await expect(page.locator('textarea[name="bio"]')).toHaveValue(bio);

    await page.getByRole("button", { name: en.addSocial, exact: true }).click();
    await page.locator('select[name="platform-2"]').selectOption("Website");
    await page.locator('input[name="socialUrl-2"]').fill("https://example.com/browser-third");
    await page.locator('input[name="followers-2"]').fill("17");
    await page.getByRole("button", { name: en.addLink, exact: true }).click();
    await page.locator('input[name="linkTitle-2"]').fill("Browser third link");
    await page.locator('input[name="linkUrl-2"]').fill("https://example.com/browser-link");
    const added = await save();
    expect(added.user.socialLinks).toEqual([
      ...original.socialLinks,
      { platform: "Website", url: "https://example.com/browser-third", followers: 17 },
    ]);
    expect(added.user.customLinks).toEqual([
      ...original.customLinks,
      { title: "Browser third link", url: "https://example.com/browser-link" },
    ]);
    await page.reload();
    await expect(page.locator('input[name^="socialUrl"]')).toHaveCount(3);
    await expect(page.locator('input[name^="linkUrl"]')).toHaveCount(3);
    await expect(page.locator('input[name="socialUrl-2"]')).toHaveValue(
      "https://example.com/browser-third",
    );
    await expect(page.locator('input[name="linkTitle-2"]')).toHaveValue("Browser third link");

    await page
      .getByRole("button", { name: en.remove + " " + en.socialPlatform + " 3", exact: true })
      .click();
    await page
      .getByRole("button", { name: en.remove + " " + en.linkTitleLabel + " 3", exact: true })
      .click();
    const removed = await save();
    expect(removed.user.socialLinks).toEqual(original.socialLinks);
    expect(removed.user.customLinks).toEqual(original.customLinks);
    await page.reload();
    await assertOriginalRows();
    await page.locator('textarea[name="bio"]').fill(original.bio ?? "");
    const restored = await save();
    expect(restored.user.bio).toBe(original.bio ?? "");
    expect(restored.user.socialLinks).toEqual(original.socialLinks);
    expect(restored.user.customLinks).toEqual(original.customLinks);
    restoreNeeded = false;
  } finally {
    // Restore only this test's own reversible edits if a UI assertion failed.
    if (restoreNeeded) {
      const restored = await page.request.post("/api/profile", {
        headers: { Origin: testInfo.project.use.baseURL as string },
        data: {
          handle: original.handle,
          displayName: original.displayName,
          bio: original.bio ?? "",
          category: original.category ?? "",
          country: original.country,
          locale: original.locale,
          ageEligible: true,
          termsAccepted: true,
          roles: original.roles.filter((role) => role !== "ADMIN"),
          socials: original.socialLinks,
          links: original.customLinks,
        },
      });
      expect(restored.status(), "Restore the seeded profile after the test's edits").toBe(200);
    }
  }
});

test("administrator previews a closed distribution period and persists its rule snapshot", async ({
  page,
}) => {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12)
    throw new Error("Supply the local seed DEMO_PASSWORD before browser journeys.");
  const finalizationRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/admin/distributions/finalize")
      finalizationRequests.push(request.method());
  });
  await login(page, "admin@ruvora.test", demoPassword);
  await page.goto("/admin");
  const beforeResponse = await page.request.get("/api/admin");
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();
  expect(before.rules?.id).toBeTruthy();
  const panel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: en.distribution, exact: true }) });
  await expect(panel.getByText(en.distributionNote, { exact: true })).toBeVisible();
  // Integration tests finalize real periods in the same CI database. Move the
  // browser's closed window before any intersecting finalized period; do not
  // remove history or relax the application's overlap check.
  const finalizedPeriods = before.distributions
    .filter((item: { state: string }) => item.state === "FINALIZED")
    .map((item: { startAt: string; endAt: string }) => ({
      startAt: Date.parse(item.startAt),
      endAt: Date.parse(item.endAt),
    }));
  let windowEnd = Math.floor((Date.now() - 60_000) / 60_000) * 60_000;
  let windowStart = windowEnd - 10 * 60_000;
  for (;;) {
    const overlaps = finalizedPeriods.filter(
      (period: { startAt: number; endAt: number }) =>
        period.startAt < windowEnd && period.endAt > windowStart,
    );
    if (overlaps.length === 0) break;
    windowEnd =
      Math.floor(
        Math.min(...overlaps.map((period: { startAt: number }) => period.startAt)) / 60_000,
      ) *
        60_000 -
      60_000;
    windowStart = windowEnd - 10 * 60_000;
  }
  const startAt = new Date(windowStart).toISOString().slice(0, 16);
  const endAt = new Date(windowEnd).toISOString().slice(0, 16);
  await panel.getByLabel(en.periodStart, { exact: true }).fill(startAt);
  await panel.getByLabel(en.periodEnd, { exact: true }).fill(endAt);
  const result = await postFromUI(page, "/admin/distributions/preview", () =>
    panel.getByRole("button", { name: en.previewDistribution, exact: true }).click(),
  );
  await expect(
    panel.getByRole("heading", { name: en.distributionPreview, exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".campaign-facts")).toContainText(en.pool);
  await expect(panel.locator(".campaign-facts strong")).toHaveText(/^€[\d,]+\.\d{2}$/);
  expect(result.preview.state).toBe("PREVIEW");
  expect(BigInt(result.preview.distributedMinor)).toBeGreaterThanOrEqual(0n);
  expect(result.preview.snapshot.startAt).toBe(startAt + ":00.000Z");
  expect(result.preview.snapshot.endAt).toBe(endAt + ":00.000Z");
  expect(result.preview.ruleVersion).toBe(before.rules.config.distribution.version);
  expect(result.preview.snapshot.rule).toEqual(before.rules.config.distribution);
  expect(result.preview.snapshot.margin.rule).toEqual(before.rules.config.margin);
  expect(["APPROVED", "REDUCED", "BLOCKED"]).toContain(result.preview.marginDecision.status);
  const renderedSnapshot = JSON.parse(await panel.locator("pre.data-json").innerText());
  expect(renderedSnapshot).toEqual(result.preview);
  await expect(
    panel.getByRole("button", { name: en.finalizeDistribution, exact: true }),
  ).toBeVisible();

  await page.reload();
  const persistedResponse = await page.request.get("/api/admin");
  expect(persistedResponse.status()).toBe(200);
  const persisted = await persistedResponse.json();
  const distribution = persisted.distributions.find(
    (item: { id: string }) => item.id === result.distribution.id,
  );
  expect(distribution).toBeTruthy();
  expect(distribution.state).toBe("PREVIEW");
  expect(distribution.finalizedAt).toBeNull();
  expect(distribution.ruleId).toBe(before.rules.id);
  expect(distribution.snapshot).toEqual(result.preview);
  expect(distribution.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(
    persisted.auditLogs.some(
      (entry: { action: string; targetId: string }) =>
        entry.action === "DISTRIBUTION_PREVIEWED" && entry.targetId === distribution.id,
    ),
  ).toBe(true);
  expect(finalizationRequests).toEqual([]);
});

test("event detail and leaderboard have no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/events/creator-rush");
  await expect(page.locator(".event-detail-hero").getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.leaderboard, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.rules, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: en.joinEvent, exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".event-detail-hero img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await assertNoOverflow(page);
  expect(errors).toEqual([]);
});
