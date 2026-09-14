import { describe, expect, it } from "vitest";
import {
  assertAttributionUse,
  DEFAULT_ATTRIBUTION_POLICY,
  referralWouldLoop,
  validateAttributionPolicy,
} from "../../src/domains/economy/attribution";
const firstTouchAt = new Date("2026-09-01T00:00:00Z");
const base = {
  boundUserId: "participant",
  userId: "participant",
  creatorId: "creator",
  advertiserId: "advertiser",
  contextCampaignId: "campaign",
  campaignId: "campaign",
  contextEventId: "event",
  eventId: "event",
  firstTouchAt,
  expiresAt: new Date("2026-09-08T00:00:00Z"),
  occurredAt: new Date("2026-09-07T23:59:59Z"),
  status: "ACTIVE",
  usedActivities: 0,
  policy: DEFAULT_ATTRIBUTION_POLICY,
};
describe("trusted attribution boundaries", () => {
  it("accepts the bound independent account inside the captured destination and window", () =>
    expect(() => assertAttributionUse(base)).not.toThrow());
  it.each([
    ["unbound", { boundUserId: null }, "ATTRIBUTION_ACCOUNT_MISMATCH"],
    ["another account", { userId: "other" }, "ATTRIBUTION_ACCOUNT_MISMATCH"],
    ["self creator", { creatorId: "participant" }, "SELF_ATTRIBUTION"],
    ["advertiser creator", { creatorId: "advertiser" }, "SELF_ATTRIBUTION"],
    ["other campaign", { campaignId: "elsewhere" }, "ATTRIBUTION_CAMPAIGN_MISMATCH"],
    ["other event", { eventId: "elsewhere" }, "ATTRIBUTION_EVENT_MISMATCH"],
    ["removed event", { eventId: null }, "ATTRIBUTION_EVENT_MISMATCH"],
    ["expiry instant", { occurredAt: new Date("2026-09-08T00:00:00Z") }, "ATTRIBUTION_EXPIRED"],
    ["before origin", { occurredAt: new Date("2026-08-31T23:59:59Z") }, "ATTRIBUTION_EXPIRED"],
    ["invalid timestamp", { occurredAt: new Date("invalid") }, "ATTRIBUTION_EXPIRED"],
    ["extended expiry", { expiresAt: new Date("2026-09-09T00:00:00Z") }, "ATTRIBUTION_EXPIRED"],
    ["revoked", { status: "REVOKED" }, "ATTRIBUTION_INACTIVE"],
    ["cap reached", { usedActivities: 100 }, "ATTRIBUTION_USAGE_LIMIT"],
  ] as const)("rejects %s", (_label, change, code) =>
    expect(() => assertAttributionUse({ ...base, ...change })).toThrow(
      expect.objectContaining({ code }),
    ),
  );
  it("generic profile context allows an otherwise eligible campaign", () =>
    expect(() =>
      assertAttributionUse({
        ...base,
        contextCampaignId: null,
        contextEventId: null,
        eventId: null,
      }),
    ).not.toThrow());
  it.each([59, 604801])("rejects an unsafe attribution window %s", (windowSeconds) =>
    expect(() =>
      validateAttributionPolicy({ ...DEFAULT_ATTRIBUTION_POLICY, windowSeconds }),
    ).toThrow(),
  );
  it("returns an immutable captured policy", () =>
    expect(Object.isFrozen(validateAttributionPolicy(DEFAULT_ATTRIBUTION_POLICY))).toBe(true));
  it("does not reinterpret a captured policy when a later default changes", () => {
    const captured = validateAttributionPolicy({
      ...DEFAULT_ATTRIBUTION_POLICY,
      maxActivitiesPerContext: 1,
    });
    expect(() => assertAttributionUse({ ...base, usedActivities: 1, policy: captured })).toThrow(
      expect.objectContaining({ code: "ATTRIBUTION_USAGE_LIMIT" }),
    );
  });
  it("rejects malformed negative use counts", () =>
    expect(() => assertAttributionUse({ ...base, usedActivities: -1 })).toThrow());
});
describe("direct referral ancestry", () => {
  it("permits one direct relationship with distinct acyclic ancestry", () =>
    expect(referralWouldLoop("parent", "child", ["parent", "grandparent"])).toBe(false));
  it("rejects self referral", () => expect(referralWouldLoop("same", "same", [])).toBe(true));
  it("rejects inviting an ancestor", () =>
    expect(referralWouldLoop("parent", "child", ["parent", "child"])).toBe(true));
  it("rejects an existing ancestry cycle", () =>
    expect(referralWouldLoop("parent", "child", ["parent", "loop", "parent"])).toBe(true));
});
