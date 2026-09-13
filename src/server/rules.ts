import { z } from "zod";
import type { RewardRule } from "../domains/economy/activity";
import { DEVELOPMENT_REWARD_RULE } from "../domains/economy/activity";
import type { Tx } from "./db";
import { jsonValue } from "./db";
import { assert } from "./errors";
export const minor = z
  .union([z.string().regex(/^\d{1,15}$/), z.number().int().safe().nonnegative()])
  .transform((v) => BigInt(v));
const bps = z.number().int().min(0).max(10000);
const rate = z
  .object({
    userRuMicros: minor,
    creatorRuMicros: minor,
    advertiserRuMicrosPerMinor: minor,
    xp: z.number().int().min(0).max(10000),
    eventPoints: z.number().int().min(0).max(10000),
  })
  .strict();
export const rulesSchema = z
  .object({
    creatorFollowerThreshold: z.number().int().min(0).max(1000000),
    allowedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(250),
    campaignReviewRequired: z.boolean(),
    reward: z
      .object({
        version: z.string().min(3).max(80),
        rates: z
          .object({
            IMPRESSION: rate.optional(),
            QUALIFIED_VIEW: rate.optional(),
            CLICK: rate.optional(),
            CONVERSION: rate.optional(),
            CREATOR_PROMOTION: rate.optional(),
            SPONSORED_MISSION: rate.optional(),
          })
          .strict(),
      })
      .strict(),
    distribution: z
      .object({
        version: z.string().min(3).max(80),
        poolBps: bps,
        categoryWeightsBps: z
          .object({ USER: bps, CREATOR: bps, ADVERTISER: bps, REFERRAL: bps })
          .strict()
          .refine(
            (v) => Object.values(v).reduce((a, b) => a + b, 0) === 10000,
            "Category weights must sum to 10000",
          ),
      })
      .strict(),
    margin: z
      .object({
        version: z.string().min(3).max(80),
        minimumRetainedBps: bps,
        operatingReserveMinor: minor,
        minimumOperatingProfitMinor: minor,
        targetOperatingProfitMinor: minor,
        mode: z.enum(["REDUCE", "BLOCK"]),
      })
      .strict(),
    liabilities: z
      .object({
        providerFeesMinor: minor,
        taxLiabilityMinor: minor,
        refundsMinor: minor,
        chargebacksMinor: minor,
        fraudLossesMinor: minor,
        campaignLiabilitiesMinor: minor,
        userRewardsMinor: minor,
        creatorRewardsMinor: minor,
        advertiserRewardsMinor: minor,
        referralAllocationsMinor: minor,
        eventLiabilitiesMinor: minor,
        prizePoolsMinor: minor,
        infrastructureMinor: minor,
        otherOperatingCostsMinor: minor,
      })
      .partial()
      .strict(),
  })
  .strict();
export const DEVELOPMENT_RULES = {
  creatorFollowerThreshold: 10,
  allowedCountries: ["FR", "DE", "BE", "ES", "IT", "NL", "GB", "US", "CA"],
  campaignReviewRequired: true,
  reward: DEVELOPMENT_REWARD_RULE,
  distribution: {
    version: "development-distribution-v1",
    poolBps: 3500,
    categoryWeightsBps: { USER: 4000, CREATOR: 3000, ADVERTISER: 2000, REFERRAL: 1000 },
  },
  margin: {
    version: "development-margin-v1",
    minimumRetainedBps: 3000,
    operatingReserveMinor: 0n,
    minimumOperatingProfitMinor: 0n,
    targetOperatingProfitMinor: 0n,
    mode: "REDUCE",
  },
  liabilities: {},
};
export async function activeRules(tx: Tx) {
  const record = await tx.economicRule.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  assert(
    record,
    "POLICY_NOT_CONFIGURED",
    "Economic features are unavailable until an administrator configures the policy.",
    503,
  );
  const config = rulesSchema.parse(record.config);
  return { record, config, reward: config.reward as RewardRule };
}
export async function createRules(tx: Tx, actorId: string, input: unknown) {
  const schema = z
    .object({
      version: z.string().min(3).max(80),
      config: rulesSchema,
      reason: z.string().trim().min(10).max(500),
    })
    .strict();
  const parsed = schema.parse(input);
  await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
  const record = await tx.economicRule.create({
    data: { version: parsed.version, config: jsonValue(parsed.config) },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: "RULES_VERSION_CREATED",
      targetId: record.id,
      details: jsonValue({ reason: parsed.reason, version: parsed.version }),
    },
  });
  return record;
}
