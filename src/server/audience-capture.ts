import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db } from "./db";
import { assert } from "./errors";
import { limitRate } from "./auth";
import { isDevelopment } from "./environment";
import {
  openSecret,
  randomToken,
  sealSecret,
  secretDigest,
  validateEncryptionKey,
} from "./security/crypto";
import { queueSecurityMail } from "./security/email";

const subscribeSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    locale: z.enum(["en", "fr"]).optional().default("fr"),
    sourceSlug: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9:_-]{1,64}$/i)
      .optional()
      .default("profile"),
    consent: z.literal(true),
  })
  .strict();

const tokenSchema = z
  .object({
    token: z.string().min(32).max(128),
  })
  .strict();

function audienceActionUrl(handle: string, fragmentKey: string, token: string): string {
  const origin = new URL(process.env.APP_URL ?? "http://localhost:3000");
  assert(
    !origin.username && !origin.password && (isDevelopment() || origin.protocol === "https:"),
    "UNSAFE_ENVIRONMENT",
    "Configure a safe application origin.",
    503,
  );
  const url = new URL(`/@${handle}`, origin);
  // Keep double-opt-in and unsubscribe tokens in the URL fragment to prevent proxy/referrer logs.
  url.hash = `${fragmentKey}=${encodeURIComponent(token)}`;
  return url.toString();
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/\r?\n/g, " ");
  const safe = /^[=+\-@\t\r]/.test(clean) ? `'${clean}` : clean;
  if (/[",]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * Public double-opt-in subscription to a creator's owned audience list.
 * Seals subscriber email at rest with AES-256-GCM and queues an encrypted MailOutbox confirmation.
 * Strictly 0 EUR / 0 RU.
 */
export async function subscribeToCreatorAudience(rawHandle: string, input: unknown, ip: string) {
  const handle = rawHandle.replace(/^@/, "").trim().toLowerCase();
  const value = subscribeSchema.parse(input);
  await limitRate("audience-subscribe-ip", ip, 25, 3600);
  validateEncryptionKey();

  const creator = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      locale: true,
      suspended: true,
      isDemo: true,
      audienceCaptureEnabled: true,
    },
  });
  assert(
    creator && creator.handle && !creator.suspended && (isDevelopment() || !creator.isDemo),
    "PROFILE_NOT_FOUND",
    "This profile is not available.",
    404,
  );
  assert(
    creator.audienceCaptureEnabled,
    "AUDIENCE_CAPTURE_DISABLED",
    "This creator has disabled newsletter subscriptions.",
    403,
  );

  const emailDigest = secretDigest(`${creator.id}:${value.email}`);
  await limitRate("audience-subscribe-pair", emailDigest, 5, 3600);

  return atomic(async (tx) => {
    const existing = await tx.audienceSubscriber.findUnique({
      where: { creatorId_emailDigest: { creatorId: creator.id, emailDigest } },
    });

    if (existing?.status === "CONFIRMED") {
      // Idempotent without revealing subscriber existence differently from pending flow.
      return { accepted: true, status: "PENDING" as const };
    }

    const confirmToken = randomToken();
    const unsubToken = randomToken();
    const recordId = existing?.id ?? randomUUID();
    const emailCiphertext = sealSecret(value.email, "aud:" + recordId);

    if (existing) {
      await tx.audienceSubscriber.update({
        where: { id: existing.id },
        data: {
          emailCiphertext,
          sourceSlug: value.sourceSlug,
          locale: value.locale,
          status: "PENDING",
          confirmTokenDigest: secretDigest(confirmToken),
          unsubscribeTokenDigest: secretDigest(unsubToken),
          unsubscribedAt: null,
        },
      });
    } else {
      await tx.audienceSubscriber.create({
        data: {
          id: recordId,
          creatorId: creator.id,
          emailCiphertext,
          emailDigest,
          sourceSlug: value.sourceSlug,
          locale: value.locale,
          status: "PENDING",
          confirmTokenDigest: secretDigest(confirmToken),
          unsubscribeTokenDigest: secretDigest(unsubToken),
        },
      });
    }

    await queueSecurityMail(
      tx,
      { id: creator.id, email: value.email, locale: value.locale },
      "AUDIENCE_CONFIRM",
      {
        creatorName: creator.displayName,
        creatorHandle: creator.handle!,
        confirmUrl: audienceActionUrl(creator.handle!, "audience_confirm", confirmToken),
        unsubscribeUrl: audienceActionUrl(creator.handle!, "audience_unsub", unsubToken),
      },
    );

    return { accepted: true, status: "PENDING" as const };
  });
}

/** Confirms a pending double-opt-in subscription via its single-use token. */
export async function confirmAudienceSubscription(input: unknown) {
  const { token } = tokenSchema.parse(input);
  const digest = secretDigest(token);
  await limitRate("audience-confirm", digest, 10, 3600);

  return atomic(async (tx) => {
    const sub = await tx.audienceSubscriber.findUnique({
      where: { confirmTokenDigest: digest },
      include: { creator: { select: { handle: true, displayName: true } } },
    });
    assert(
      sub && sub.status === "PENDING",
      "INVALID_AUDIENCE_TOKEN",
      "This confirmation link is invalid or already used.",
      400,
    );
    const now = new Date();
    await tx.audienceSubscriber.update({
      where: { id: sub.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: now,
        confirmTokenDigest: null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "AUDIENCE_SUBSCRIPTION_CONFIRMED",
        targetId: sub.creatorId,
        details: { subscriberId: sub.id, sourceSlug: sub.sourceSlug },
      },
    });
    return {
      ok: true,
      status: "CONFIRMED" as const,
      creatorHandle: sub.creator.handle,
      creatorName: sub.creator.displayName,
    };
  });
}

/** One-click unsubscribe using the subscriber's unsubscribe token. */
export async function unsubscribeAudience(input: unknown) {
  const { token } = tokenSchema.parse(input);
  const digest = secretDigest(token);
  await limitRate("audience-unsub", digest, 10, 3600);

  return atomic(async (tx) => {
    const sub = await tx.audienceSubscriber.findUnique({
      where: { unsubscribeTokenDigest: digest },
    });
    assert(sub, "INVALID_AUDIENCE_TOKEN", "This unsubscribe link is invalid.", 400);
    if (sub.status !== "UNSUBSCRIBED") {
      await tx.audienceSubscriber.update({
        where: { id: sub.id },
        data: {
          status: "UNSUBSCRIBED",
          confirmTokenDigest: null,
          unsubscribedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "AUDIENCE_SUBSCRIPTION_UNSUBSCRIBED",
          targetId: sub.creatorId,
          details: { subscriberId: sub.id },
        },
      });
    }
    return { ok: true, status: "UNSUBSCRIBED" as const };
  });
}

/** Lists confirmed subscribers & summary counts for the creator owner. */
export async function listCreatorAudienceSubscribers(user: User) {
  const [fresh, grouped, confirmedRows] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { audienceCaptureEnabled: true, audienceCapturePrompt: true },
    }),
    db.audienceSubscriber.groupBy({
      by: ["status"],
      where: { creatorId: user.id },
      _count: { _all: true },
    }),
    db.audienceSubscriber.findMany({
      where: { creatorId: user.id, status: "CONFIRMED" },
      orderBy: { confirmedAt: "desc" },
      take: 200,
    }),
  ]);
  const counts = new Map(grouped.map((g) => [g.status, g._count._all]));
  const subscribers = confirmedRows.map((row) => {
    let email = "[protected]";
    try {
      email = openSecret(row.emailCiphertext, "aud:" + row.id);
    } catch {
      email = "[protected]";
    }
    return {
      id: row.id,
      email,
      sourceSlug: row.sourceSlug,
      locale: row.locale,
      confirmedAt: row.confirmedAt?.toISOString() ?? row.createdAt.toISOString(),
    };
  });
  return {
    enabled: fresh.audienceCaptureEnabled,
    prompt: fresh.audienceCapturePrompt,
    confirmedCount: counts.get("CONFIRMED") ?? 0,
    pendingCount: counts.get("PENDING") ?? 0,
    unsubscribedCount: counts.get("UNSUBSCRIBED") ?? 0,
    subscribers,
  };
}

/** Exports only CONFIRMED subscribers as RFC 4180 CSV with formula-injection protection. */
export async function exportCreatorAudienceCsv(user: User): Promise<string> {
  const rows = await db.audienceSubscriber.findMany({
    where: { creatorId: user.id, status: "CONFIRMED" },
    orderBy: { confirmedAt: "desc" },
    take: 5000,
  });
  const lines = ["email,source,locale,confirmed_at"];
  for (const row of rows) {
    let email = "";
    try {
      email = openSecret(row.emailCiphertext, "aud:" + row.id);
    } catch {
      continue;
    }
    lines.push(
      [
        escapeCsvCell(email),
        escapeCsvCell(row.sourceSlug),
        escapeCsvCell(row.locale),
        escapeCsvCell((row.confirmedAt ?? row.createdAt).toISOString()),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Allows the creator owner to permanently remove a subscriber record. */
export async function deleteAudienceSubscriber(user: User, subscriberId: string) {
  return atomic(async (tx) => {
    const existing = await tx.audienceSubscriber.findUnique({ where: { id: subscriberId } });
    assert(
      existing && existing.creatorId === user.id,
      "SUBSCRIBER_NOT_FOUND",
      "This subscriber record could not be found.",
      404,
    );
    await tx.audienceSubscriber.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "AUDIENCE_SUBSCRIBER_REMOVED",
        targetId: existing.id,
        details: {},
      },
    });
    return { deleted: true, id: existing.id };
  });
}
