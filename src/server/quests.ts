import type { PrismaClient, User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "./db";
import { assert } from "./errors";
import { notifyUser } from "./notifications";

export interface QuestDefinition {
  code: string;
  xpAwarded: number;
  titleKey: string;
  descriptionKey: string;
  href: string;
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    code: "COMPLETE_PROFILE",
    xpAwarded: 50,
    titleKey: "p4QuestCompleteProfileTitle",
    descriptionKey: "p4QuestCompleteProfileDesc",
    href: "/app/settings",
  },
  {
    code: "VERIFY_EMAIL",
    xpAwarded: 60,
    titleKey: "p4QuestVerifyEmailTitle",
    descriptionKey: "p4QuestVerifyEmailDesc",
    href: "/app/security",
  },
  {
    code: "CONNECT_SOCIAL",
    xpAwarded: 75,
    titleKey: "p4QuestConnectSocialTitle",
    descriptionKey: "p4QuestConnectSocialDesc",
    href: "/app/settings",
  },
  {
    code: "VERIFY_AUDIENCE",
    xpAwarded: 120,
    titleKey: "p4QuestVerifyAudienceTitle",
    descriptionKey: "p4QuestVerifyAudienceDesc",
    href: "/app/creator",
  },
  {
    code: "FIRST_VALIDATED",
    xpAwarded: 100,
    titleKey: "p4QuestFirstValidatedTitle",
    descriptionKey: "p4QuestFirstValidatedDesc",
    href: "/app/opportunities",
  },
  {
    code: "COMMUNITY_BUILDER",
    xpAwarded: 150,
    titleKey: "p4QuestCommunityBuilderTitle",
    descriptionKey: "p4QuestCommunityBuilderDesc",
    href: "/app/events",
  },
  {
    code: "FIRST_SOCIAL_SHARE",
    xpAwarded: 60,
    titleKey: "p6QuestSocialShareTitle",
    descriptionKey: "p6QuestSocialShareDesc",
    href: "/app/promote",
  },
  {
    code: "MULTI_CHANNEL_PROMOTER",
    xpAwarded: 110,
    titleKey: "p6QuestMultiChannelTitle",
    descriptionKey: "p6QuestMultiChannelDesc",
    href: "/app/promote",
  },
  {
    code: "FIRST_REFERRAL_INVITE",
    xpAwarded: 130,
    titleKey: "p6QuestFirstReferralTitle",
    descriptionKey: "p6QuestFirstReferralDesc",
    href: "/app/referrals",
  },
  {
    code: "FIRST_POST_PLAN",
    xpAwarded: 50,
    titleKey: "p8QuestFirstPostPlanTitle",
    descriptionKey: "p8QuestFirstPostPlanDesc",
    href: "/app/promote",
  },
  {
    code: "CONSISTENT_PROMOTER",
    xpAwarded: 100,
    titleKey: "p8QuestConsistentPromoterTitle",
    descriptionKey: "p8QuestConsistentPromoterDesc",
    href: "/app/promote",
  },
  {
    code: "FIRST_COLLECTION",
    xpAwarded: 50,
    titleKey: "p9QuestFirstCollectionTitle",
    descriptionKey: "p9QuestFirstCollectionDesc",
    href: "/app/promote",
  },
  {
    code: "AUDIENCE_BUILDER",
    xpAwarded: 75,
    titleKey: "p9QuestAudienceBuilderTitle",
    descriptionKey: "p9QuestAudienceBuilderDesc",
    href: "/app/promote",
  },
] as const;

export interface QuestFacts {
  onboarded: boolean;
  hasHandle: boolean;
  bioLength: number;
  emailVerified: boolean;
  followers: number;
  socialCount: number;
  audienceVerified: boolean;
  validatedActivities: number;
  eventMemberships: number;
  referralsSent: number;
  socialShareChannels?: number;
  showcasePinnedCount?: number;
  postPlansCount?: number;
  publishedPostPlansCount?: number;
  publishedCollectionsCount?: number;
  confirmedSubscribersCount?: number;
}

export function evaluateQuestCompletion(code: string, facts: QuestFacts): boolean {
  switch (code) {
    case "COMPLETE_PROFILE":
      return facts.onboarded && facts.hasHandle && facts.bioLength >= 10;
    case "VERIFY_EMAIL":
      return facts.emailVerified;
    case "CONNECT_SOCIAL":
      return facts.followers >= 10 && facts.socialCount >= 1;
    case "VERIFY_AUDIENCE":
      return facts.audienceVerified;
    case "FIRST_VALIDATED":
      return facts.validatedActivities >= 1;
    case "COMMUNITY_BUILDER":
      return (
        facts.eventMemberships >= 1 || facts.referralsSent >= 1 || facts.validatedActivities >= 3
      );
    case "FIRST_SOCIAL_SHARE":
      return (facts.socialShareChannels ?? 0) >= 1;
    case "MULTI_CHANNEL_PROMOTER":
      return (facts.socialShareChannels ?? 0) >= 2 || (facts.showcasePinnedCount ?? 0) >= 1;
    case "FIRST_REFERRAL_INVITE":
      return facts.referralsSent >= 1;
    case "FIRST_POST_PLAN":
      return (facts.postPlansCount ?? 0) >= 1;
    case "CONSISTENT_PROMOTER":
      return (
        ((facts.publishedPostPlansCount ?? 0) >= 1 && (facts.socialShareChannels ?? 0) >= 1) ||
        (facts.publishedPostPlansCount ?? 0) >= 2
      );
    case "FIRST_COLLECTION":
      return (facts.publishedCollectionsCount ?? 0) >= 1;
    case "AUDIENCE_BUILDER":
      return (facts.confirmedSubscribersCount ?? 0) >= 1;
    default:
      return false;
  }
}

async function gatherQuestFacts(client: PrismaClient | Tx, userId: string): Promise<QuestFacts> {
  const [
    fresh,
    validatedActivities,
    eventMemberships,
    referralsSent,
    socialLinksShared,
    kitShareEvents,
    showcasePinnedCount,
    postPlansCount,
    publishedPostPlansCount,
    publishedCollectionsCount,
    confirmedSubscribersCount,
  ] = await Promise.all([
    client.user.findUniqueOrThrow({ where: { id: userId } }),
    client.activity.count({ where: { userId, state: "VALIDATED" } }),
    client.eventMembership.count({ where: { userId } }),
    client.referral.count({ where: { inviterId: userId } }),
    client.shareLink.findMany({
      where: { ownerId: userId, active: true, socialChannel: { not: "DIRECT" } },
      select: { socialChannel: true },
      distinct: ["socialChannel"],
    }),
    client.growthEvent.findMany({
      where: { userId, type: "SOCIAL_KIT_SHARED" },
      select: { socialChannel: true },
      distinct: ["socialChannel"],
    }),
    client.creatorShowcaseItem.count({ where: { creatorId: userId, pinned: true } }),
    client.creatorPostPlan.count({ where: { userId } }),
    client.creatorPostPlan.count({ where: { userId, status: "PUBLISHED" } }),
    client.creatorCollection.count({ where: { creatorId: userId, published: true } }),
    client.audienceSubscriber.count({ where: { creatorId: userId, status: "CONFIRMED" } }),
  ]);
  const socials = Array.isArray(fresh.socialLinks) ? fresh.socialLinks : [];
  const distinctChannels = new Set([
    ...socialLinksShared.map((r) => r.socialChannel),
    ...kitShareEvents.map((r) => r.socialChannel),
  ]);
  return {
    onboarded: fresh.onboarded,
    hasHandle: Boolean(fresh.handle),
    bioLength: fresh.bio.trim().length,
    emailVerified: Boolean(fresh.emailVerifiedAt),
    followers: fresh.followers,
    socialCount: socials.length,
    audienceVerified: fresh.audienceStatus === "VERIFIED",
    validatedActivities,
    eventMemberships,
    referralsSent,
    socialShareChannels: distinctChannels.size,
    showcasePinnedCount,
    postPlansCount,
    publishedPostPlansCount,
    publishedCollectionsCount,
    confirmedSubscribersCount,
  };
}

export async function listQuests(user: User) {
  const [facts, claims] = await Promise.all([
    gatherQuestFacts(db, user.id),
    db.questClaim.findMany({ where: { userId: user.id } }),
  ]);
  const claimMap = new Map(claims.map((c) => [c.questCode, c]));
  const quests = QUEST_DEFINITIONS.map((def) => {
    const claim = claimMap.get(def.code);
    const completed = evaluateQuestCompletion(def.code, facts);
    return {
      ...def,
      completed,
      claimed: Boolean(claim),
      claimedAt: claim?.claimedAt ?? null,
    };
  });
  const totalQuestXp = claims.reduce((sum, c) => sum + c.xpAwarded, 0);
  return { quests, totalQuestXp };
}

const claimSchema = z
  .object({
    questCode: z.string().min(3).max(60),
  })
  .strict();

/** Claims strictly XP-only progression quests (never creates Money, RU or Event Points). */
export async function claimQuest(user: User, input: unknown) {
  const { questCode } = claimSchema.parse(input);
  const def = QUEST_DEFINITIONS.find((q) => q.code === questCode);
  assert(def, "QUEST_NOT_FOUND", "This quest does not exist.", 404);

  return atomic(async (tx) => {
    const existing = await tx.questClaim.findUnique({
      where: { userId_questCode: { userId: user.id, questCode } },
    });
    if (existing) {
      return { claim: existing, alreadyClaimed: true };
    }
    const facts = await gatherQuestFacts(tx, user.id);
    assert(
      evaluateQuestCompletion(questCode, facts),
      "QUEST_NOT_COMPLETED",
      "Complete the quest requirements before claiming its XP.",
      409,
    );
    const claim = await tx.questClaim.create({
      data: {
        userId: user.id,
        questCode: def.code,
        xpAwarded: def.xpAwarded,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "QUEST_CLAIMED",
        targetId: claim.id,
        details: { questCode: def.code, xpAwarded: def.xpAwarded, currencyImpact: "NONE" },
      },
    });
    await notifyUser(tx, {
      userId: user.id,
      kind: "QUEST_CLAIMED",
      titleKey: "p4NotifQuestClaimed",
      bodyParams: { xp: def.xpAwarded, quest: def.code },
      href: "/app",
    });
    return { claim, alreadyClaimed: false };
  });
}
