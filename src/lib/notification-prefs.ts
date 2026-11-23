import { z } from "zod";

export const notificationPrefsSchema = z
  .object({
    campaignMatch: z.boolean().default(true),
    payoutUpdates: z.boolean().default(true),
    ugcUpdates: z.boolean().default(true),
    weeklyDigestEmail: z.boolean().default(false),
  })
  .strict();

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  campaignMatch: true,
  payoutUpdates: true,
  ugcUpdates: true,
  weeklyDigestEmail: false,
};

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    campaignMatch:
      typeof obj.campaignMatch === "boolean"
        ? obj.campaignMatch
        : DEFAULT_NOTIFICATION_PREFS.campaignMatch,
    payoutUpdates:
      typeof obj.payoutUpdates === "boolean"
        ? obj.payoutUpdates
        : DEFAULT_NOTIFICATION_PREFS.payoutUpdates,
    ugcUpdates:
      typeof obj.ugcUpdates === "boolean" ? obj.ugcUpdates : DEFAULT_NOTIFICATION_PREFS.ugcUpdates,
    weeklyDigestEmail:
      typeof obj.weeklyDigestEmail === "boolean"
        ? obj.weeklyDigestEmail
        : DEFAULT_NOTIFICATION_PREFS.weeklyDigestEmail,
  };
}

/** Returns whether an in-app notification kind should be delivered given user preferences. */
export function isNotificationKindEnabled(kind: string, prefs: NotificationPrefs): boolean {
  if (kind === "CAMPAIGN_MATCH") return prefs.campaignMatch;
  if (kind.startsWith("PAYOUT_")) return prefs.payoutUpdates;
  if (kind.startsWith("UGC_") || kind === "CAMPAIGN_INVITATION") return prefs.ugcUpdates;
  return true;
}
