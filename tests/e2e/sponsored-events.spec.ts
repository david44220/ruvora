import "dotenv/config";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID, createHmac } from "node:crypto";
import { en } from "../../src/i18n/messages";
import { totpCode, encodeBase32, decodeBase32 } from "../../src/server/security/totp";
type EventRecord = {
  id: string;
  slug: string;
  title: string;
  state: string;
  startAt: string;
  endAt: string;
  configVersion: string;
};
type Preview = {
  settlement: { id: string; fingerprint: string; ruleVersion: string };
  preview: {
    awardedMinor: string;
    refundMinor: string;
    allocations: { userId: string; amountMinor: string }[];
  };
};
async function post<T>(page: Page, baseURL: string, path: string, data: unknown): Promise<T> {
  const result = await page.request.post(`/api${path}`, { headers: { Origin: baseURL }, data });
  expect(result.status(), `${path}: ${await result.text()}`).toBeLessThan(300);
  return result.json();
}
async function fromUI<T>(page: Page, path: string, action: () => Promise<void>) {
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "POST",
  );
  await action();
  const response = await pending;
  expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
  return {
    body: (await response.json()) as T,
    request: response.request().postDataJSON() as unknown,
  };
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: en.login, exact: true }).click();
  await expect(page).toHaveURL(/app$/);
  const snapshot = (await (await page.request.get("/api/dashboard")).json()) as {
    user: { id: string };
  };
  return snapshot.user.id;
}
async function stepUp(page: Page, userId: string, password: string) {
  await page.goto("/app/security");
  const panel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: en.p2StepUp, exact: true }) });
  await expect(panel).toBeVisible();
  await panel.locator('input[name="password"]').fill(password);
  // Derive only the explicitly seeded local test authenticator, without importing Next server session APIs.
  const secret = encodeBase32(
    createHmac("sha256", decodeBase32(process.env.DEMO_TOTP_SECRET!))
      .update("ruvora-admin:" + userId)
      .digest()
      .subarray(0, 20),
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    await panel.locator('input[name="code"]').fill(totpCode(secret));
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/security/mfa/step-up" &&
        r.request().method() === "POST",
    );
    await panel.getByRole("button", { name: en.p2StepUp, exact: true }).click();
    const response = await pending;
    if (response.ok()) {
      await expect(page.getByRole("status")).toContainText(en.p2StepUpSuccess);
      return;
    }
    expect((await response.json()).error.code).toBe("INVALID_MFA_CODE");
    // A prior sequential browser journey may have consumed this 30-second counter.
    // Wait for the next real counter; never reset credentials or replay protection.
    await page.waitForTimeout(30000 - (Date.now() % 30000) + 100);
  }
  throw new Error("The development authenticator did not produce a fresh usable counter.");
}
function managed(page: Page, title: string) {
  return page
    .locator("article.managed-event-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}
function adminEvent(page: Page, title: string) {
  return page
    .locator("article.admin-event-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}
test("funded sponsored event uses two real MFA administrators and settles its immutable prize into the wallet", async ({
  browser,
}, testInfo) => {
  test.setTimeout(300000);
  const password = process.env.DEMO_PASSWORD;
  if (!password || !process.env.DEMO_TOTP_SECRET)
    throw new Error(
      "Seed both explicit development administrators and supply local DEMO_PASSWORD and DEMO_TOTP_SECRET.",
    );
  const baseURL = testInfo.project.use.baseURL as string,
    tag = randomUUID().slice(0, 8),
    key = () => `browser-event:${tag}:${randomUUID()}`;
  const contexts: BrowserContext[] = [],
    errors: string[] = [];
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
  const sponsor = await newPage(),
    participant = await newPage(),
    operator = await newPage(),
    reviewer = await newPage();
  const title = `Sponsored browser event ${tag}`,
    reason = `Independent sponsored event browser review ${tag}.`;
  try {
    let participantId = "";
    for (const [page, role, name] of [
      [sponsor, "ADVERTISER", "sponsor"],
      [participant, "USER", "participant"],
    ] as const) {
      const registered = await post<{ user: { id: string } }>(page, baseURL, "/auth/register", {
        email: `event-${name}-${tag}@browser.test`,
        displayName: `Event ${name} ${tag}`,
        password: `Event-browser-password-${tag}!`,
        role,
      });
      await post(page, baseURL, "/profile", {
        handle: `evt_${name}_${tag}`,
        displayName: `Event ${name} ${tag}`,
        bio: "Independent funded event browser participant.",
        category: "Design",
        locale: "en",
        country: "FR",
        ageEligible: true,
        termsAccepted: true,
        socials: [],
        links: [],
      });
      if (role === "USER") participantId = registered.user.id;
    }
    const operatorId = await login(operator, "admin@ruvora.test", password);
    const reviewerId = await login(reviewer, "demo-admin-reviewer@ruvora.test", password);
    let event!: EventRecord,
      campaignId = "",
      activityId = "";
    await test.step("advertiser creates and funds the localized event through the application", async () => {
      await sponsor.goto("/app/event-studio");
      const deposit = sponsor.locator("section.deposit-panel");
      await deposit.locator('input[name="amountMinor"]').fill("2001");
      const funded = await fromUI<{ availableMinor: string; development: boolean }>(
        sponsor,
        "/payments/deposit",
        () => deposit.getByRole("button", { name: en.p2Deposit, exact: true }).click(),
      );
      expect(funded.body.development).toBe(true);
      expect(funded.body.availableMinor).toBe("2001");
      await sponsor.getByRole("button", { name: en.p2CreateEvent, exact: true }).click();
      await sponsor.locator('input[name="title"]').fill(title);
      await sponsor.locator('input[name="slug"]').fill(`sponsored-browser-${tag}`);
      await sponsor
        .locator('textarea[name="description-en"]')
        .fill("A short free-entry sponsored event with funded deterministic prizes.");
      await sponsor
        .locator('textarea[name="description-fr"]')
        .fill("Un evenement gratuit avec des prix finances et deterministes.");
      await sponsor
        .locator('input[name="startAt"]')
        .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
      const end = Math.ceil((Date.now() + 60000) / 60000) * 60000;
      await sponsor.locator('input[name="endAt"]').fill(new Date(end).toISOString().slice(0, 16));
      await sponsor.locator('input[name="prizeBudgetMinor"]').fill("1001");
      await sponsor.locator('input[name="participantCap"]').fill("20");
      await sponsor.locator('input[name="tiers"]').fill("6000,2000,2000");
      const created = await fromUI<{ event: EventRecord }>(sponsor, "/events", () =>
        sponsor.getByRole("button", { name: en.submitDraft, exact: true }).click(),
      );
      event = created.body.event;
      expect(event.state).toBe("DRAFT");
      const card = managed(sponsor, title);
      await fromUI(sponsor, `/events/${event.id}/fund`, () =>
        card.getByRole("button", { name: en.p2FundPrize, exact: true }).click(),
      );
      const state = (await (await sponsor.request.get("/api/dashboard")).json()) as {
        summary: { ruMicros: string; xp: number; eventPoints: number };
      };
      expect(state.summary.ruMicros).toBe("0");
      expect(state.summary.xp).toBe(0);
      expect(state.summary.eventPoints).toBe(0);
    });
    await test.step("linked media passes independent review before event approval and activation", async () => {
      const created = await post<{ campaign: { id: string } }>(sponsor, baseURL, "/campaigns", {
        name: `Event media ${tag}`,
        description: "Independently reviewed event campaign story.",
        objective: "QUALIFIED_VIEW",
        destinationUrl: "https://example.com/event-story",
        budgetMinor: "1000",
        dailyBudgetMinor: "1000",
        unitCostMinor: "25",
        startAt: event.startAt,
        endAt: event.endAt,
        eventId: event.id,
        frequencyCap: 3,
      });
      campaignId = created.campaign.id;
      await post(sponsor, baseURL, `/campaigns/${campaignId}/fund`, {
        amountMinor: "1000",
        idempotencyKey: key(),
        source: "AVAILABLE",
      });
      await post(sponsor, baseURL, `/campaigns/${campaignId}/submit`, {});
      await post(operator, baseURL, `/admin/campaigns/${campaignId}/review`, {
        decision: "APPROVE",
        reason,
      });
      const card = managed(sponsor, title);
      await card.locator("textarea").fill(reason);
      await fromUI(sponsor, `/events/${event.id}/transition`, () =>
        card.getByRole("button", { name: en.submitReview, exact: true }).click(),
      );
      await operator.goto("/admin");
      const reviewCard = adminEvent(operator, title);
      await reviewCard.locator("textarea").fill(reason);
      const reviewed = await fromUI<{ event: EventRecord }>(
        operator,
        `/admin/events/${event.id}/review`,
        () => reviewCard.getByRole("button", { name: en.approve, exact: true }).click(),
      );
      expect(reviewed.body.event.state).toBe("APPROVED");
      await sponsor.reload();
      const approved = managed(sponsor, title);
      await approved.locator("textarea").fill(reason);
      const active = await fromUI<{ event: EventRecord }>(
        sponsor,
        `/events/${event.id}/transition`,
        () => approved.getByRole("button", { name: en.p2ActivateEvent, exact: true }).click(),
      );
      expect(active.body.event.state).toBe("ACTIVE");
    });
    await test.step("participant joins and earns validated event points with no immediate money", async () => {
      await participant.goto(`/events/${event.slug}`);
      await expect(participant.getByRole("heading", { level: 1 })).toHaveText(title);
      await fromUI(participant, `/events/${event.id}/join`, () =>
        participant.getByRole("button", { name: en.joinEvent, exact: true }).click(),
      );
      await participant.goto("/app/opportunities");
      const card = participant.locator("article.campaign-card").filter({
        has: participant.getByRole("heading", { name: `Event media ${tag}`, exact: true }),
      });
      await card
        .locator('textarea[name="evidence"]')
        .fill(`Independent browser view of the event story ${tag}.`);
      const pending = await fromUI<{ activity: { id: string; state: string } }>(
        participant,
        "/activities",
        () => card.getByRole("button", { name: en.participate, exact: true }).click(),
      );
      activityId = pending.body.activity.id;
      expect(pending.body.activity.state).toBe("PENDING_VALIDATION");
      await operator.reload();
      const review = operator
        .locator("article.review-card")
        .filter({ hasText: `Independent browser view of the event story ${tag}.` });
      await review.locator("textarea").fill(reason);
      await review.locator('input[type="checkbox"]').check();
      await fromUI(operator, `/admin/activities/${activityId}/review`, () =>
        review.getByRole("button", { name: en.validate, exact: true }).click(),
      );
      const summary = (await (await participant.request.get("/api/dashboard")).json()) as {
        summary: { eventPoints: number; moneyMinor: string };
      };
      expect(summary.summary.eventPoints).toBe(15);
      expect(summary.summary.moneyMinor).toBe("0");
    });
    await test.step("close the original event window without rewriting its immutable dates", async () => {
      await expect
        .poll(() => Date.now(), { timeout: 125000, intervals: [1000] })
        .toBeGreaterThanOrEqual(Date.parse(event.endAt) + 100);
      await sponsor.reload();
      const card = managed(sponsor, title);
      await card.locator("textarea").fill(reason);
      await fromUI(sponsor, `/events/${event.id}/transition`, () =>
        card.getByRole("button", { name: en.p2CompleteEvent, exact: true }).click(),
      );
    });
    await test.step("fresh MFA and a different administrator approve the exact frozen preview", async () => {
      const preliminary = await post<Preview>(
        operator,
        baseURL,
        `/admin/events/${event.id}/preview`,
        {},
      );
      const denied = await operator.request.post(`/api/admin/events/${event.id}/settle`, {
        headers: { Origin: baseURL },
        data: {
          previewId: preliminary.settlement.id,
          idempotencyKey: key(),
          approvalId: "not-approved",
        },
      });
      expect(denied.status()).toBe(403);
      expect((await denied.json()).error.code).toBe("FRESH_AUTH_REQUIRED");
      await stepUp(operator, operatorId, password);
      await operator.goto("/admin");
      const card = adminEvent(operator, title);
      await card.locator("textarea").fill(reason);
      const result = await fromUI<Preview>(operator, `/admin/events/${event.id}/preview`, () =>
        card.getByRole("button", { name: en.p2PreviewSettlement, exact: true }).click(),
      );
      expect(result.body.preview.allocations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: participantId, amountMinor: "601" }),
        ]),
      );
      expect(result.body.preview.refundMinor).toBe("400");
      const approval = await fromUI<{ approval: { id: string } }>(
        operator,
        "/admin/approvals",
        () => card.getByRole("button", { name: en.p2RequestApproval, exact: true }).click(),
      );
      const self = await operator.request.post(
        `/api/admin/approvals/${approval.body.approval.id}/review`,
        { headers: { Origin: baseURL }, data: { decision: "APPROVED", reason } },
      );
      expect(self.status()).toBe(403);
      expect((await self.json()).error.code).toBe("SELF_APPROVAL");
      await stepUp(reviewer, reviewerId, password);
      await reviewer.goto("/admin");
      const approvalCard = reviewer
        .locator("article.approval-card")
        .filter({ hasText: approval.body.approval.id });
      await approvalCard.locator("textarea").fill(reason);
      await fromUI(reviewer, `/admin/approvals/${approval.body.approval.id}/review`, () =>
        approvalCard.getByRole("button", { name: en.p2ApproveRequest, exact: true }).click(),
      );
      const final = await fromUI<{ settlement: { id: string; state: string } }>(
        operator,
        `/admin/events/${event.id}/settle`,
        () => card.getByRole("button", { name: en.p2FinalizeSettlement, exact: true }).click(),
      );
      expect(final.body.settlement.state).toBe("FINALIZED");
      const replay = await post<{ settlement: { id: string } }>(
        operator,
        baseURL,
        `/admin/events/${event.id}/settle`,
        final.request,
      );
      expect(replay.settlement.id).toBe(final.body.settlement.id);
    });
    await test.step("immutable public ranking and wallet show the exact payable credit and sponsor refund", async () => {
      const detail = (await (
        await participant.request.get(`/api/events/${event.slug}`)
      ).json()) as {
        event: { state: string; fundedMinor: string };
        personalPrizeMinor: string;
        personal: { rank: number; points: number };
      };
      expect(detail.event.state).toBe("SETTLED");
      expect(detail.event.fundedMinor).toBe("0");
      expect(detail.personalPrizeMinor).toBe("601");
      expect(detail.personal).toMatchObject({ rank: 1, points: 15 });
      const dashboard = (await (await participant.request.get("/api/dashboard")).json()) as {
        summary: { moneyMinor: string };
        transactions: { amountMinor: string; transaction: { kind: string; referenceId: string } }[];
      };
      expect(dashboard.summary.moneyMinor).toBe("601");
      expect(
        dashboard.transactions.filter(
          (row) =>
            row.transaction.kind === "EVENT_PRIZE_SETTLEMENT" &&
            row.transaction.referenceId === event.id,
        ),
      ).toHaveLength(1);
      const funds = (await (await sponsor.request.get("/api/payments/account")).json()) as {
        availableMinor: string;
      };
      expect(funds.availableMinor).toBe("400");
      await participant.goto(`/events/${event.slug}`);
      await expect(
        participant
          .locator(".event-detail-stats div")
          .filter({ has: participant.getByText(en.p2YourPrize, { exact: true }) })
          .locator("strong"),
      ).toHaveText("€6.01");
      await participant.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          participant.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
          ),
        )
        .toBe(true);
      await participant.screenshot({
        path: testInfo.outputPath("settled-event-mobile.png"),
        fullPage: true,
      });
      await participant.goto("/app/wallet");
      await expect(participant.getByRole("heading", { level: 1 })).toHaveText(en.rewards);
      await expect(participant.locator("tbody tr").filter({ hasText: "€6.01" })).toHaveCount(1);
      await participant.screenshot({
        path: testInfo.outputPath("event-prize-wallet-mobile.png"),
        fullPage: true,
      });
    });
    expect(errors, "Browser runtime errors").toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
