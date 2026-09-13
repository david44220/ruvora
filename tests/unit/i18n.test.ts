import { describe, expect, it } from "vitest";
import { en, fr, messages } from "../../src/i18n/messages";

describe("supported locale dictionaries", () => {
  it("provides exactly the same message keys in English and French", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(messages).sort()).toEqual(["en", "fr"]);
  });

  it.each(Object.entries(messages))(
    "%s contains no missing or blank translated strings",
    (_locale, dictionary) => {
      const missing = Object.entries(dictionary)
        .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
        .map(([key]) => key);
      expect(missing).toEqual([]);
    },
  );

  it.each(Object.entries(messages))(
    "%s covers persisted activity, RU and campaign states",
    (_locale, dictionary) => {
      const states = [
        "DRAFT",
        "PENDING_REVIEW",
        "ACTIVE",
        "PAUSED",
        "COMPLETED",
        "REJECTED",
        "ARCHIVED",
        "RECEIVED",
        "PENDING_VALIDATION",
        "VALIDATED",
        "REVERSED",
        "CONSUMED",
        "PENDING",
        "UPCOMING",
        "OPEN",
        "FINALIZED",
      ];
      const untranslated = states.filter(
        (state) => !dictionary[`status${state}` as keyof typeof dictionary],
      );
      expect(untranslated).toEqual([]);
    },
  );

  it("keeps action and safety messages translated instead of falling back to the English UI", () => {
    const critical = [
      "login",
      "register",
      "adult",
      "saveProfile",
      "activityDisclaimer",
      "noGuarantee",
      "payoutsUnavailable",
      "development",
      "distributionNote",
      "sessionExpired",
    ] as const;
    for (const key of critical) expect(fr[key], key).not.toBe(en[key]);
  });
});
