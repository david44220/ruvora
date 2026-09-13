import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { Role, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assert } from "./errors";
import { hashPassword, verifyPassword } from "./security/password";
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ruvora_session" : "ruvora_session";
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
const registration = credentials
  .extend({
    displayName: z.string().trim().min(2).max(60),
    role: z.enum(["USER", "CREATOR", "ADVERTISER"]).default("USER"),
    locale: z.enum(["en", "fr"]).default("en"),
    referralHandle: z
      .string()
      .regex(/^[a-z0-9_]{3,24}$/)
      .optional(),
  })
  .strict();
export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    handle: user.handle,
    roles: user.roles,
    locale: user.locale,
    onboarded: user.onboarded,
    country: user.country,
    bio: user.bio,
    category: user.category,
    socialLinks: user.socialLinks,
    customLinks: user.customLinks,
    followers: user.followers,
    audienceStatus: user.audienceStatus,
    economicHold: user.economicHold,
    isDemo: user.isDemo,
  };
}
/** Persistent limits protect identifiers without relying on spoofable forwarded headers. */
export async function limitRate(scope: string, identifier: string, limit = 10, seconds = 900) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = tokenDigest(`${scope}:${identifier}:${window}`);
  const record = await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowEnd: new Date((window + 1) * seconds * 1000) },
    update: { count: { increment: 1 } },
  });
  assert(record.count <= limit, "RATE_LIMITED", "Too many attempts. Please try again later.", 429);
}
async function issueSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await db.session.create({
    data: { id: randomUUID(), tokenHash: tokenDigest(token), userId, expiresAt },
  });
  return { token, expiresAt };
}
export async function register(input: unknown) {
  const value = registration.parse(input);
  await limitRate("register", value.email, 5);
  assert(
    !(await db.user.findUnique({ where: { email: value.email } })),
    "EMAIL_EXISTS",
    "An account already uses this email.",
    409,
  );
  const inviter = value.referralHandle
    ? await db.user.findUnique({ where: { handle: value.referralHandle } })
    : null;
  const user = await db.user.create({
    data: {
      email: value.email,
      passwordHash: await hashPassword(value.password),
      displayName: value.displayName,
      roles: value.role === "USER" ? [Role.USER] : [Role.USER, value.role],
      locale: value.locale,
      ...(inviter && !inviter.suspended
        ? { referralReceived: { create: { inviterId: inviter.id } } }
        : {}),
    },
  });
  return { user: publicUser(user), session: await issueSession(user.id) };
}
export async function login(input: unknown) {
  const value = credentials.strict().parse(input);
  await limitRate("login", value.email);
  const user = await db.user.findUnique({ where: { email: value.email } });
  const valid = await verifyPassword(
    value.password,
    user?.passwordHash ?? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`,
  );
  assert(
    user && valid && !user.suspended && (process.env.NODE_ENV !== "production" || !user.isDemo),
    "INVALID_CREDENTIALS",
    "Email or password is incorrect.",
    401,
  );
  return { user: publicUser(user), session: await issueSession(user.id) };
}
export async function userFromToken(token?: string) {
  if (!token || token.length > 128) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenDigest(token) },
    include: { user: true },
  });
  return session &&
    session.expiresAt > new Date() &&
    !session.user.suspended &&
    (process.env.NODE_ENV !== "production" || !session.user.isDemo)
    ? session.user
    : null;
}
export async function getCurrentUser() {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser() {
  const user = await getCurrentUser();
  assert(user, "UNAUTHENTICATED", "Sign in to continue.", 401);
  return user;
}
export function requireRole(user: Pick<User, "roles">, role: Role) {
  if (!user.roles.includes(role))
    throw new AppError("FORBIDDEN", "Your account does not have this permission.", 403);
}
export async function logout(token?: string) {
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenDigest(token) } });
}
export function assertOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
  assert(
    request.headers.get("origin") === expected,
    "INVALID_ORIGIN",
    "This request origin is not allowed.",
    403,
  );
  const site = request.headers.get("sec-fetch-site");
  assert(
    !site || site === "same-origin" || site === "none",
    "INVALID_ORIGIN",
    "This request origin is not allowed.",
    403,
  );
}
