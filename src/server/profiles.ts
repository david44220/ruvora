import { z } from "zod";
import { evaluatePersistedPolicy } from "../domains/policy";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { activeRules } from "./rules";
import { publicUser } from "./auth";
export const safeUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a public HTTPS URL.");
const profileSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/)
      .refine(
        (v) => !["admin", "api", "support", "ruvora", "login", "register", "events"].includes(v),
        "This handle is reserved.",
      ),
    displayName: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(300).default(""),
    category: z.string().trim().max(40).default("Creator"),
    locale: z.enum(["en", "fr"]).default("en"),
    country: z.string().regex(/^[A-Z]{2}$/),
    ageEligible: z.literal(true),
    termsAccepted: z.literal(true),
    roles: z
      .array(z.enum(["USER", "CREATOR", "ADVERTISER"]))
      .max(3)
      .optional(),
    socials: z
      .array(
        z
          .object({
            platform: z.string().trim().min(2).max(30),
            url: safeUrl,
            followers: z.number().int().min(0).max(1000000000),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    links: z
      .array(z.object({ title: z.string().trim().min(1).max(50), url: safeUrl }).strict())
      .max(12)
      .default([]),
  })
  .strict();
export async function saveProfile(user: User, input: unknown) {
  const value = profileSchema.parse(input);
  return atomic(async (tx) => {
    const conflict = await tx.user.findUnique({ where: { handle: value.handle } });
    assert(
      !conflict || conflict.id === user.id,
      "HANDLE_UNAVAILABLE",
      "This handle is already in use.",
      409,
    );
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const roles = [...new Set([...current.roles, ...(value.roles ?? []), "USER" as const])];
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        handle: value.handle,
        displayName: value.displayName,
        bio: value.bio,
        category: value.category,
        locale: value.locale,
        country: value.country,
        ageEligible: true,
        termsAcceptedAt: current.termsAcceptedAt ?? new Date(),
        onboarded: true,
        roles,
        socialLinks: jsonValue(value.socials),
        customLinks: jsonValue(value.links),
        followers: Math.max(0, ...value.socials.map((social) => social.followers)),
        audienceStatus: "SELF_DECLARED",
      },
    });
    return { user: publicUser(updated) };
  });
}
export async function assertEligible(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const { config } = await activeRules(tx);
  assert(
    !user.suspended && !user.economicHold,
    "ECONOMIC_HOLD",
    "This account requires an eligibility review.",
    403,
  );
  assert(
    evaluatePersistedPolicy(user, "PARTICIPATION", config).eligible,
    "POLICY_INELIGIBLE",
    "Complete onboarding and check regional availability before participating.",
    403,
  );
  assert(
    process.env.NODE_ENV !== "production" || !user.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development accounts cannot perform production economic operations.",
    403,
  );
  return user;
}
export async function getPublicProfile(handle: string) {
  const user = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      displayName: true,
      handle: true,
      bio: true,
      category: true,
      socialLinks: true,
      customLinks: true,
      followers: true,
      audienceStatus: true,
      isDemo: true,
      suspended: true,
      roles: true,
      createdAt: true,
    },
  });
  assert(user && !user.suspended, "PROFILE_NOT_FOUND", "This profile is not available.", 404);
  const xp =
    (await db.xpEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } }))._sum
      .amount ?? 0;
  return {
    profile: { ...user, xp, level: Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1 },
    events: await db.event.findMany({
      where: { state: "ACTIVE", memberships: { some: { userId: user.id } } },
      take: 4,
    }),
    campaigns: await db.campaign.findMany({
      where: { state: "ACTIVE", advertiserId: user.id },
      take: 4,
      select: {
        id: true,
        name: true,
        description: true,
        objective: true,
        destinationUrl: true,
        endAt: true,
        isDemo: true,
      },
    }),
  };
}
