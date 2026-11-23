import { describe, expect, it } from "vitest";
import { pass07 } from "../../src/i18n/pass07";
import {
  detectDeviceOs,
  detectPreferredLocale,
  resolveSmartDestination,
} from "../../src/lib/smart-routing";
import { CAMPAIGN_TEMPLATES } from "../../src/lib/campaign-templates";
import manifest from "../../src/app/manifest";

describe("Pass 07 unit checks: i18n parity, Smart Routing, 30s Templates & PWA Manifest", () => {
  it("enforces strict EN/FR key parity and non-empty values for pass07 dictionary", () => {
    const enKeys = Object.keys(pass07.en).sort();
    const frKeys = Object.keys(pass07.fr).sort();
    expect(enKeys).toEqual(frKeys);
    for (const key of enKeys) {
      expect(pass07.en[key as keyof typeof pass07.en].trim().length).toBeGreaterThan(0);
      expect(pass07.fr[key as keyof typeof pass07.fr].trim().length).toBeGreaterThan(0);
    }
  });

  it("detects visitor OS and preferred language safely from request headers", () => {
    expect(
      detectDeviceOs("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
    expect(detectDeviceOs("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36")).toBe(
      "android",
    );
    expect(detectDeviceOs("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0")).toBe("web");
    expect(detectDeviceOs(null)).toBe("web");

    expect(detectPreferredLocale("fr-FR,fr;q=0.9,en-US;q=0.8")).toBe("fr");
    expect(detectPreferredLocale("es-ES,es;q=0.9")).toBe("es");
    expect(detectPreferredLocale("ja-JP,en;q=0.8")).toBe("en");
    expect(detectPreferredLocale("ja-JP")).toBeNull();
  });

  it("resolves Smart Routing destinations by A/B precedence, OS, locale, and default fallback", () => {
    const routing = {
      iosUrl: "https://apps.apple.com/app/demo",
      androidUrl: "https://play.google.com/store/apps/details?id=demo",
      localeUrls: { fr: "https://example.com/fr", en: "https://example.com/en" },
    };
    const abVariants = [{ id: "A", destinationUrl: "https://example.com/landing-a" }];

    // A/B variant takes precedence when assigned
    expect(
      resolveSmartDestination({
        destinationUrl: "https://example.com/default",
        smartRouting: routing,
        abVariants,
        abVariantId: "A",
        userAgent: "iPhone",
      }),
    ).toEqual({ url: "https://example.com/landing-a", routeTarget: "ab-variant" });

    // iOS routes to App Store
    expect(
      resolveSmartDestination({
        destinationUrl: "https://example.com/default",
        smartRouting: routing,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      }),
    ).toEqual({ url: routing.iosUrl, routeTarget: "ios" });

    // Android routes to Google Play
    expect(
      resolveSmartDestination({
        destinationUrl: "https://example.com/default",
        smartRouting: routing,
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
      }),
    ).toEqual({ url: routing.androidUrl, routeTarget: "android" });

    // Desktop French routes to locale FR URL
    expect(
      resolveSmartDestination({
        destinationUrl: "https://example.com/default",
        smartRouting: routing,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
        acceptLanguage: "fr-FR,fr;q=0.9",
      }),
    ).toEqual({ url: "https://example.com/fr", routeTarget: "locale:fr" });

    // Unsupported language falls back cleanly to default destination
    expect(
      resolveSmartDestination({
        destinationUrl: "https://example.com/default",
        smartRouting: routing,
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        acceptLanguage: "ja-JP",
      }),
    ).toEqual({ url: "https://example.com/default", routeTarget: "default" });
  });

  it("provides 5 valid turnkey bilingual campaign templates with transparent disclosures", () => {
    expect(CAMPAIGN_TEMPLATES).toHaveLength(5);
    for (const tpl of CAMPAIGN_TEMPLATES) {
      expect(tpl.destinationUrl.startsWith("https://")).toBe(true);
      expect(BigInt(tpl.unitCostMinor)).toBeLessThanOrEqual(BigInt(tpl.dailyBudgetMinor));
      expect(BigInt(tpl.dailyBudgetMinor)).toBeLessThanOrEqual(BigInt(tpl.budgetMinor));
      expect(tpl.briefDisclosure.en.toLowerCase()).toContain("#ad");
      expect(tpl.briefDisclosure.fr.toLowerCase()).toContain("#collaboration");
      expect(tpl.platforms.length).toBeGreaterThan(0);
    }
  });

  it("generates a valid standalone PWA manifest referencing canonical Ruvora orb icons", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app/promote");
    expect(m.theme_color).toBe("#0b0a09");
    expect(m.icons?.some((i) => i.src === "/assets/pwa/icon-192.png")).toBe(true);
    expect(m.icons?.some((i) => i.src === "/assets/pwa/icon-512.png")).toBe(true);
    expect(m.shortcuts?.length).toBeGreaterThanOrEqual(3);
  });
});
