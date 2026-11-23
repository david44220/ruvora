export type SmartRoutingLocale = "fr" | "en" | "es" | "de" | "it" | "pt";

export interface SmartRoutingConfig {
  iosUrl?: string;
  androidUrl?: string;
  localeUrls?: Partial<Record<SmartRoutingLocale, string>>;
}

export type DeviceOs = "ios" | "android" | "web";

export type SmartRouteTarget = "default" | "ab-variant" | "ios" | "android" | `locale:${string}`;

const SUPPORTED_LOCALES = new Set<SmartRoutingLocale>(["fr", "en", "es", "de", "it", "pt"]);

export function detectDeviceOs(userAgent: string | null | undefined): DeviceOs {
  if (!userAgent) return "web";
  const ua = userAgent.toLowerCase();
  if (/(iphone|ipad|ipod|ios)/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

export function detectPreferredLocale(
  acceptLanguage: string | null | undefined,
): SmartRoutingLocale | null {
  if (!acceptLanguage) return null;
  const parts = acceptLanguage
    .split(",")
    .map((entry) => entry.trim().split(";")[0]?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  for (const tag of parts) {
    const primary = tag.split("-")[0] as SmartRoutingLocale;
    if (SUPPORTED_LOCALES.has(primary)) return primary;
  }
  return null;
}

export function normalizeSmartRouting(raw: unknown): SmartRoutingConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const iosUrl =
    typeof obj.iosUrl === "string" && obj.iosUrl.trim() ? obj.iosUrl.trim() : undefined;
  const androidUrl =
    typeof obj.androidUrl === "string" && obj.androidUrl.trim() ? obj.androidUrl.trim() : undefined;
  const localeUrls: Partial<Record<SmartRoutingLocale, string>> = {};
  if (obj.localeUrls && typeof obj.localeUrls === "object" && !Array.isArray(obj.localeUrls)) {
    for (const [key, val] of Object.entries(obj.localeUrls as Record<string, unknown>)) {
      const k = key.toLowerCase() as SmartRoutingLocale;
      if (SUPPORTED_LOCALES.has(k) && typeof val === "string" && val.trim()) {
        localeUrls[k] = val.trim();
      }
    }
  }
  if (!iosUrl && !androidUrl && Object.keys(localeUrls).length === 0) return null;
  return {
    ...(iosUrl ? { iosUrl } : {}),
    ...(androidUrl ? { androidUrl } : {}),
    ...(Object.keys(localeUrls).length > 0 ? { localeUrls } : {}),
  };
}

export function resolveSmartDestination(params: {
  destinationUrl: string;
  smartRouting?: SmartRoutingConfig | unknown | null;
  abVariants?: { id: string; destinationUrl: string }[] | unknown | null;
  abVariantId?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
}): { url: string; routeTarget: SmartRouteTarget } {
  const { destinationUrl, abVariants, abVariantId, userAgent, acceptLanguage } = params;

  if (abVariantId && Array.isArray(abVariants)) {
    const match = abVariants.find(
      (v): v is { id: string; destinationUrl: string } =>
        Boolean(v) &&
        typeof v === "object" &&
        (v as { id?: unknown }).id === abVariantId &&
        typeof (v as { destinationUrl?: unknown }).destinationUrl === "string",
    );
    if (match?.destinationUrl) {
      return { url: match.destinationUrl, routeTarget: "ab-variant" };
    }
  }

  const routing = normalizeSmartRouting(params.smartRouting);
  if (routing) {
    const os = detectDeviceOs(userAgent);
    if (os === "ios" && routing.iosUrl) {
      return { url: routing.iosUrl, routeTarget: "ios" };
    }
    if (os === "android" && routing.androidUrl) {
      return { url: routing.androidUrl, routeTarget: "android" };
    }
    const lang = detectPreferredLocale(acceptLanguage);
    if (lang && routing.localeUrls?.[lang]) {
      return { url: routing.localeUrls[lang]!, routeTarget: `locale:${lang}` };
    }
  }

  return { url: destinationUrl, routeTarget: "default" };
}
