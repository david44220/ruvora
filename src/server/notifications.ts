import type { User } from "@prisma/client";
import { z } from "zod";
import { db, jsonValue, type Tx } from "./db";

export interface NotifyUserInput {
  userId: string;
  kind: string;
  titleKey: string;
  bodyParams?: Record<string, string | number>;
  href?: string;
}

export async function notifyUser(tx: Tx, input: NotifyUserInput) {
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

export async function listNotifications(user: User) {
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);
  return { notifications, unreadCount };
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
