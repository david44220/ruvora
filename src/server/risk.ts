import type { PrismaClient, User } from "@prisma/client";
import type { Tx } from "./db";

export interface ActivityRiskInput {
  rejectedCount30d: number;
  reversedCount90d: number;
  submissionsLastHour: number;
  attributionAgeMs: number | null;
  type: string;
  hasEvidence: boolean;
  hasVerifiedConversion: boolean;
  isDemoCampaign: boolean;
  accountAgeHours: number;
}

export interface ActivityRiskResult {
  riskScore: number;
  signals: string[];
}

export function evaluateActivityRisk(input: ActivityRiskInput): ActivityRiskResult {
  let score = 0;
  const signals: string[] = [];

  if (input.reversedCount90d >= 2) {
    score += 40;
    signals.push("REPEATED_REVERSALS");
  } else if (input.reversedCount90d === 1) {
    score += 25;
    signals.push("PRIOR_REVERSAL");
  }

  if (input.rejectedCount30d >= 4) {
    score += 30;
    signals.push("HIGH_REJECTION_RATE");
  } else if (input.rejectedCount30d >= 2) {
    score += 15;
    signals.push("RECENT_REJECTIONS");
  }

  if (input.submissionsLastHour >= 12) {
    score += 30;
    signals.push("BURST_VELOCITY");
  } else if (input.submissionsLastHour >= 6) {
    score += 15;
    signals.push("ELEVATED_VELOCITY");
  }

  if (
    !input.isDemoCampaign &&
    input.attributionAgeMs !== null &&
    input.attributionAgeMs >= 0 &&
    input.attributionAgeMs < 3000
  ) {
    score += 20;
    signals.push("RAPID_ATTRIBUTION");
  }

  if (input.type === "CONVERSION" && !input.hasVerifiedConversion && !input.hasEvidence) {
    score += 25;
    signals.push("UNVERIFIED_CONVERSION");
  }

  if (input.accountAgeHours < 24 && input.submissionsLastHour >= 4) {
    score += 15;
    signals.push("NEW_ACCOUNT_BURST");
  }

  return {
    riskScore: Math.max(0, Math.min(100, score)),
    signals,
  };
}

export async function computeActivityRisk(
  tx: Tx,
  params: {
    userId: string;
    userCreatedAt: Date;
    type: string;
    hasEvidence: boolean;
    attributionCreatedAt?: Date | null;
    isDemoCampaign: boolean;
    hasVerifiedConversion?: boolean;
  },
): Promise<ActivityRiskResult> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 3600_000);
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000);
  const ninetyDaysAgo = new Date(now - 90 * 86_400_000);

  const [submissionsLastHour, rejectedCount30d, reversedCount90d] = await Promise.all([
    tx.activity.count({
      where: { userId: params.userId, createdAt: { gte: oneHourAgo } },
    }),
    tx.activity.count({
      where: {
        userId: params.userId,
        state: "REJECTED",
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    tx.activity.count({
      where: {
        userId: params.userId,
        state: "REVERSED",
        createdAt: { gte: ninetyDaysAgo },
      },
    }),
  ]);

  const attributionAgeMs = params.attributionCreatedAt
    ? now - params.attributionCreatedAt.getTime()
    : null;
  const accountAgeHours = Math.max(0, (now - params.userCreatedAt.getTime()) / 3600_000);

  return evaluateActivityRisk({
    rejectedCount30d,
    reversedCount90d,
    submissionsLastHour,
    attributionAgeMs,
    type: params.type,
    hasEvidence: params.hasEvidence,
    hasVerifiedConversion: Boolean(params.hasVerifiedConversion),
    isDemoCampaign: params.isDemoCampaign,
    accountAgeHours,
  });
}

export type TrustTier = "EXPLORER" | "TRUSTED" | "AMBASSADOR";

export interface ReliabilitySummary {
  reliabilityScore: number;
  tier: TrustTier;
  validatedCount: number;
  rejectedCount: number;
  reversedCount: number;
}

export function computeReliabilityFromCounts(input: {
  validatedCount: number;
  rejectedCount: number;
  reversedCount: number;
  audienceVerified: boolean;
  emailVerified: boolean;
}): ReliabilitySummary {
  const total = input.validatedCount + input.rejectedCount + input.reversedCount;
  const base = total === 0 ? 75 : Math.round((input.validatedCount / total) * 100);
  const penalty = input.reversedCount * 15;
  const bonus = (input.audienceVerified ? 10 : 0) + (input.emailVerified ? 5 : 0);
  const reliabilityScore = Math.max(0, Math.min(100, base - penalty + bonus));

  let tier: TrustTier = "EXPLORER";
  if (reliabilityScore >= 85 && input.validatedCount >= 5 && input.audienceVerified) {
    tier = "AMBASSADOR";
  } else if (reliabilityScore >= 70 && (input.validatedCount >= 1 || input.audienceVerified)) {
    tier = "TRUSTED";
  }

  return {
    reliabilityScore,
    tier,
    validatedCount: input.validatedCount,
    rejectedCount: input.rejectedCount,
    reversedCount: input.reversedCount,
  };
}

export async function getCreatorReliability(
  client: PrismaClient | Tx,
  user: Pick<User, "id" | "audienceStatus" | "emailVerifiedAt">,
): Promise<ReliabilitySummary> {
  const groups = await client.activity.groupBy({
    by: ["state"],
    where: { OR: [{ userId: user.id }, { creatorId: user.id }] },
    _count: true,
  });
  const count = (state: string) => groups.find((row) => row.state === state)?._count ?? 0;
  return computeReliabilityFromCounts({
    validatedCount: count("VALIDATED"),
    rejectedCount: count("REJECTED"),
    reversedCount: count("REVERSED"),
    audienceVerified: user.audienceStatus === "VERIFIED",
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
