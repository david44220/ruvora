import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:"))
    return true;
  if (ip.startsWith("::ffff:")) return isPrivateOrReservedIp(ip.slice(7));
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * SSRF-hardened live public bio fetcher (enabled when AUDIENCE_LIVE_FETCH=true).
 * Resolves DNS explicitly to reject loopback/private/link-local targets, forbids redirects,
 * caps payload size at 256 KB, and aborts after 5 seconds.
 */
export async function fetchPublicBioContainsToken(
  proofUrl: string,
  expectedCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const parsed = new URL(proofUrl);
  assert(
    parsed.protocol === "https:",
    "INVALID_PROOF_URL",
    "Live audience check requires HTTPS.",
    400,
  );
  const host = parsed.hostname;
  if (isIP(host)) {
    assert(
      !isPrivateOrReservedIp(host),
      "SSRF_BLOCKED",
      "Private IP proof URLs are forbidden.",
      400,
    );
  } else {
    const resolved = await lookup(host, { all: true }).catch(() => []);
    assert(resolved.length > 0, "PROOF_HOST_UNREACHABLE", "Proof host could not be resolved.", 400);
    for (const entry of resolved) {
      assert(
        !isPrivateOrReservedIp(entry.address),
        "SSRF_BLOCKED",
        "Private network target forbidden.",
        400,
      );
    }
  }
  const res = await fetchImpl(proofUrl, {
    method: "GET",
    redirect: "error",
    headers: { "User-Agent": "RuvoraAudienceVerifier/1.0 (+https://ruvora.app)" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return false;
  const reader = res.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 262_144) {
      await reader.cancel();
      chunks.push(value.subarray(0, Math.max(0, value.byteLength - (total - 262_144))));
      break;
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks).toString("utf8");
  return html.toUpperCase().includes(expectedCode.toUpperCase());
}

export async function confirmAudienceVerification(user: User, input: unknown) {
  const value = confirmSchema.parse(input);
  assert(
    urlMatchesPlatform(value.platform, value.proofUrl),
    "PLATFORM_URL_MISMATCH",
    "The profile link must match the selected social platform.",
    400,
  );
  const liveFetchEnabled = process.env.AUDIENCE_LIVE_FETCH === "true";

  // Pre-fetch challenge outside DB transaction if live fetch is explicitly enabled
  let liveMatched = false;
  if (liveFetchEnabled) {
    assert(
      Boolean(user.audienceVerifyCode),
      "AUDIENCE_CHALLENGE_REQUIRED",
      "Generate a verification code first before confirming your profile.",
      409,
    );
    liveMatched = await fetchPublicBioContainsToken(value.proofUrl, user.audienceVerifyCode!);
    assert(
      liveMatched,
      "BIO_CODE_NOT_FOUND",
      "Verification code was not found in the public profile page.",
      400,
    );
  }

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

    const source = liveMatched
      ? "BIO_CODE_VERIFIED_LIVE"
      : isDevelopment()
        ? "BIO_CODE_CHALLENGE_DEV"
        : "BIO_CODE_CHALLENGE";
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

    await tx.audienceVerificationSnapshot.create({
      data: {
        userId: user.id,
        platform: value.platform,
        handleUrl: value.proofUrl,
        declaredFollowers: updated.followers,
        provenance: source,
        verifiedAt: now,
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
          honestProvenance: liveMatched
            ? "Live HTTPS bio token detected; follower count remains self-declared without OAuth."
            : "Self-initiated bio-code verification; no external OAuth claim.",
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
