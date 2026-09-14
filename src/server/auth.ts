import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { Role, type User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "./db";
import { AppError, assert } from "./errors";
import { hashPassword, verifyPassword } from "./security/password";
import { isDevelopment } from "./environment";
export const SESSION_COOKIE = !isDevelopment() ? "__Host-ruvora_session" : "ruvora_session";
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
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
    profileModules: user.profileModules,
    emailVerifiedAt: user.emailVerifiedAt,
    mfaEnabledAt: user.mfaEnabledAt,
    emailVerified: Boolean(user.emailVerifiedAt),
    mfaEnabled: Boolean(user.mfaEnabledAt),
  };
}
export async function limitRate(scope: string, identifier: string, limit = 10, seconds = 900) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = tokenDigest(scope + ":" + identifier + ":" + window);
  const record = await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowEnd: new Date((window + 1) * seconds * 1000) },
    update: { count: { increment: 1 } },
  });
  assert(record.count <= limit, "RATE_LIMITED", "Too many attempts. Please try again later.", 429);
}
async function createSession(tx: Tx, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86400_000);
  await tx.session.create({
    data: {
      id: randomUUID(),
      tokenHash: tokenDigest(token),
      userId,
      expiresAt,
      authenticatedAt: new Date(),
    },
  });
  return { token, expiresAt };
}
export async function register(input: unknown) {
  // Referral identity is bound separately from server-issued opaque attribution.
  const value = registration.parse(input);
  await limitRate("register", value.email, 5);
  const passwordHash = await hashPassword(value.password);
  return atomic(async (tx) => {
    assert(
      !(await tx.user.findUnique({ where: { email: value.email } })),
      "EMAIL_EXISTS",
      "An account already uses this email.",
      409,
    );
    const user = await tx.user.create({
      data: {
        email: value.email,
        passwordHash,
        displayName: value.displayName,
        roles: value.role === "USER" ? [Role.USER] : [Role.USER, value.role],
        locale: value.locale,
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "ACCOUNT_REGISTERED", targetId: user.id, details: {} },
    });
    return { user: publicUser(user), session: await createSession(tx, user.id) };
  });
}
export async function login(input: unknown) {
  const value = credentials.strict().parse(input);
  await limitRate("login", value.email);
  const user = await db.user.findUnique({ where: { email: value.email } });
  const valid = await verifyPassword(
    value.password,
    user?.passwordHash ?? "scrypt$" + "0".repeat(32) + "$" + "0".repeat(128),
  );
  if (!user || !valid || user.suspended || (!isDevelopment() && user.isDemo)) {
    await db.auditLog.create({
      data: { action: "LOGIN_REJECTED", targetId: tokenDigest(value.email), details: {} },
    });
    throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  }
  return atomic(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      current.passwordHash === user.passwordHash &&
        !current.suspended &&
        (isDevelopment() || !current.isDemo),
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
      401,
    );
    const session = await createSession(tx, current.id);
    await tx.auditLog.create({
      data: {
        actorId: current.id,
        action: "LOGIN_SUCCEEDED",
        targetId: current.id,
        details: { method: "PASSWORD", mfaElevation: false },
      },
    });
    return { user: publicUser(current), session };
  });
}
export async function sessionFromToken(token?: string) {
  if (!token || token.length > 128) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenDigest(token) },
    include: { user: true },
  });
  return session &&
    session.expiresAt > new Date() &&
    !session.user.suspended &&
    (isDevelopment() || !session.user.isDemo)
    ? session
    : null;
}
export async function userFromToken(token?: string) {
  return (await sessionFromToken(token))?.user ?? null;
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
