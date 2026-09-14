const recoveryCodes = [
  "SHARE_LINK_INVALID",
  "SHARE_LINK_INACTIVE",
  "SELF_ATTRIBUTION",
  "ATTRIBUTION_ACCOUNT_MISMATCH",
  "ATTRIBUTION_TOKEN_INVALID",
  "ATTRIBUTION_EXPIRED",
  "CREATOR_INELIGIBLE",
  "CREATOR_CAMPAIGN_INELIGIBLE",
  "CAMPAIGN_INACTIVE",
  "INSUFFICIENT_FUNDS",
  "EVENT_INACTIVE",
  "DEMO_PRODUCTION_BLOCKED",
] as const;
export type ShareRecoveryCode = (typeof recoveryCodes)[number];
export function isShareSlug(value: string): boolean {
  return /^[A-Za-z0-9_-]{24}$/.test(value);
}
export function isShareRecoveryCode(value: string): value is ShareRecoveryCode {
  return (recoveryCodes as readonly string[]).includes(value);
}
export function shareRecoveryDetails(code?: string, retry?: string) {
  const safeCode = code && isShareRecoveryCode(code) ? code : "SHARE_LINK_INACTIVE";
  return {
    code: safeCode,
    retryPath:
      safeCode === "ATTRIBUTION_ACCOUNT_MISMATCH" && retry && isShareSlug(retry)
        ? `/go/${retry}`
        : null,
  };
}
