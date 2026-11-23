import type { User } from "@prisma/client";
import { z } from "zod";
import { db, jsonValue, type Tx } from "./db";
import { isNotificationKindEnabled, normalizeNotificationPrefs } from "../lib/notification-prefs";

export interface NotifyUserInput {
  userId: string;
  kind: string;
  titleKey: string;
  bodyParams?: Record<string, string | number>;
  href?: string;
}

export async function notifyUser(tx: Tx, input: NotifyUserInput) {
  const recipient = await tx.user.findUnique({
    where: { id: input.userId },
    select: { notificationPrefs: true },
  });
  if (recipient) {
    const prefs = normalizeNotificationPrefs(recipient.notificationPrefs);
    if (!isNotificationKindEnabled(input.kind, prefs)) {
      return null;
    }
  }
  return tx.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      titleKey: input.titleKey,
      bodyParams: jsonValue(input.bodyParams ?? {}),
      href: input.href ?? null,
    },
  });
}

export async function listNotifications(user: User, options?: { cursor?: string; limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    }),
    db.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);
  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;
  return {
    notifications,
    unreadCount,
    nextCursor: hasMore ? notifications[notifications.length - 1]!.id : null,
  };
}

const markReadSchema = z
  .object({
    ids: z.array(z.string().min(1).max(100)).max(50).optional(),
  })
  .strict();

export async function markNotificationsRead(user: User, input: unknown) {
  const value = markReadSchema.parse(input ?? {});
  const now = new Date();
  const updated = await db.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(value.ids && value.ids.length > 0 ? { id: { in: value.ids } } : {}),
    },
    data: { readAt: now },
  });
  const unreadCount = await db.notification.count({
    where: { userId: user.id, readAt: null },
  });
  return { marked: updated.count, unreadCount };
}
