import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, jsonValue } from "./db";
import { assert } from "./errors";
import { publicUser } from "./auth";
import { isDevelopment } from "./environment";
import { safeUrl } from "./validation";
import { notifyUser } from "./notifications";

const SUPPORTED_PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Twitch",
  "X",
  "Discord",
  "Website",
] as const;

const PLATFORM_DOMAINS: Record<(typeof SUPPORTED_PLATFORMS)[number], readonly string[]> = {
  Instagram: ["instagram.com"],
  TikTok: ["tiktok.com"],
  YouTube: ["youtube.com", "youtu.be"],
  Twitch: ["twitch.tv"],
  X: ["x.com", "twitter.com"],
  Discord: ["discord.gg", "discord.com"],
  Website: [],
};

export function urlMatchesPlatform(
  platform: (typeof SUPPORTED_PLATFORMS)[number],
  rawUrl: string,
): boolean {
  const allowed = PLATFORM_DOMAINS[platform];
  if (!allowed.length) return true;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return allowed.some((domain) => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

const beginSchema = z
  .object({
    platform: z.enum(SUPPORTED_PLATFORMS),
  })
  .strict();

export async function beginAudienceVerification(user: User, input: unknown) {
  const value = beginSchema.parse(input);
  const code = `ruvora-verify-${randomBytes(4).toString("hex").toUpperCase()}`;
  return atomic(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      !fresh.suspended && !fresh.economicHold,
      "ECONOMIC_HOLD",
      "This account cannot verify audience while restricted.",
      403,
    );
    await tx.user.update({
      where: { id: user.id },
      data: {
        audienceVerifyCode: code,
        audienceVerifiedPlatform: value.platform,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "AUDIENCE_VERIFY_STARTED",
        targetId: user.id,
        details: { platform: value.platform },
      },
    });
    return { code, platform: value.platform };
  });
}

const confirmSchema = z
  .object({
    platform: z.enum(SUPPORTED_PLATFORMS),
    proofUrl: safeUrl,
    declaredFollowers: z.number().int().min(10).max(1_000_000_000).optional(),
  })
  .strict();

export async function confirmAudienceVerification(user: User, input: unknown) {
  const value = confirmSchema.parse(input);
  assert(
    urlMatchesPlatform(value.platform, value.proofUrl),
    "PLATFORM_URL_MISMATCH",
    "The profile link must match the selected social platform.",
    400,
  );
  return atomic(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      !fresh.suspended && !fresh.economicHold,
      "ECONOMIC_HOLD",
      "This account cannot verify audience while restricted.",
      403,
    );
    assert(
      Boolean(fresh.audienceVerifyCode),
      "AUDIENCE_CHALLENGE_REQUIRED",
      "Generate a verification code first before confirming your profile.",
      409,
    );
    const existingSocials = Array.isArray(fresh.socialLinks)
      ? (fresh.socialLinks as { platform: string; url: string; followers: number }[])
      : [];
    const followers = Math.max(fresh.followers, value.declaredFollowers ?? 0);
    assert(
      followers >= 10,
      "CREATOR_INELIGIBLE",
      "Audience verification requires at least 10 followers.",
      400,
    );

    const hasPlatform = existingSocials.some(
      (row) => row.platform.toLowerCase() === value.platform.toLowerCase(),
    );
    const updatedSocials = hasPlatform
      ? existingSocials.map((row) =>
          row.platform.toLowerCase() === value.platform.toLowerCase()
            ? {
                ...row,
                url: value.proofUrl,
                followers: Math.max(row.followers, value.declaredFollowers ?? row.followers),
              }
            : row,
        )
      : [
          ...existingSocials,
          { platform: value.platform, url: value.proofUrl, followers: Math.max(10, followers) },
        ];

    const source = isDevelopment() ? "BIO_CODE_CHALLENGE_DEV" : "BIO_CODE_CHALLENGE";
    const now = new Date();
    const roles = fresh.roles.includes("CREATOR")
      ? fresh.roles
      : ([...fresh.roles, "CREATOR"] as User["roles"]);

    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        audienceStatus: "VERIFIED",
        audienceVerifiedAt: now,
        audienceVerifiedPlatform: value.platform,
        audienceVerifiedSource: source,
        followers: Math.max(followers, ...updatedSocials.map((s) => s.followers)),
        socialLinks: jsonValue(updatedSocials),
        roles,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "AUDIENCE_VERIFIED",
        targetId: user.id,
        details: {
          platform: value.platform,
          source,
          followers: updated.followers,
          honestProvenance: "Self-initiated bio-code verification; no external OAuth claim.",
        },
      },
    });
    await notifyUser(tx, {
      userId: user.id,
      kind: "AUDIENCE_VERIFIED",
      titleKey: "p4NotifAudienceVerified",
      bodyParams: { platform: value.platform },
      href: "/app/creator",
    });
    return {
      user: publicUser(updated),
      verifiedAt: now,
      platform: value.platform,
      source,
    };
  });
}
