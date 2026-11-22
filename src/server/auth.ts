import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { Role, type User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "./db";
import { AppError, assert } from "./errors";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "./security/password";
import { isDevelopment } from "./environment";
export const sessionCookieName = () =>
  !isDevelopment() ? "__Host-ruvora_session" : "ruvora_session";
export const SESSION_COOKIE = sessionCookieName();
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
/** Extracts a normalized client network key for hashed rate-limit buckets only (never persisted raw). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  if (candidate && /^[0-9a-fA-F:.,]{2,64}$/.test(candidate)) return candidate;
  return "loopback";
}
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
    city: user.city,
    preferredLanguages: user.preferredLanguages,
    autoMonetize: user.autoMonetize,
    profileTheme: user.profileTheme,
    bio: user.bio,
    category: user.category,
    socialLinks: user.socialLinks,
    customLinks: user.customLinks,
    followers: user.followers,
    audienceStatus: user.audienceStatus,
    audienceVerifyCode: user.audienceVerifyCode,
    audienceVerifiedAt: user.audienceVerifiedAt,
    audienceVerifiedPlatform: user.audienceVerifiedPlatform,
    audienceVerifiedSource: user.audienceVerifiedSource,
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
export async function pruneExpiredRateLimits() {
  return db.rateLimit.deleteMany({ where: { windowEnd: { lt: new Date() } } });
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
export async function register(input: unknown, ip?: string) {
  // Referral identity is bound separately from server-issued opaque attribution.
  const value = registration.parse(input);
  if (ip) await limitRate("register-ip", ip, 20, 900);
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
export async function login(input: unknown, ip?: string) {
  const value = credentials.strict().parse(input);
  if (ip) await limitRate("login-ip", ip, 40, 900);
  await limitRate("login", value.email);
  const user = await db.user.findUnique({ where: { email: value.email } });
  const valid = await verifyPassword(
    value.password,
    user?.passwordHash ?? "scrypt2$32768$8$1$" + "0".repeat(32) + "$" + "0".repeat(128),
  );
  if (!user || !valid || user.suspended || (!isDevelopment() && user.isDemo)) {
    await db.auditLog.create({
      data: { action: "LOGIN_REJECTED", targetId: tokenDigest(value.email), details: {} },
    });
    throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  }
  const upgradedHash = passwordNeedsRehash(user.passwordHash)
    ? await hashPassword(value.password)
    : null;
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
    if (upgradedHash)
      await tx.user.update({ where: { id: current.id }, data: { passwordHash: upgradedHash } });
    const session = await createSession(tx, current.id);
    await tx.auditLog.create({
      data: {
        actorId: current.id,
        action: "LOGIN_SUCCEEDED",
        targetId: current.id,
        details: { method: "PASSWORD", mfaElevation: false, hashUpgraded: Boolean(upgradedHash) },
      },
    });
    return { user: publicUser(current), session };
  });
}
export async function changePassword(user: User, token: string | undefined, input: unknown) {
  const value = z
    .object({
      currentPassword: z.string().min(12).max(128),
      newPassword: z.string().min(12).max(128),
    })
    .strict()
    .parse(input);
  assert(
    value.currentPassword !== value.newPassword,
    "VALIDATION_ERROR",
    "Choose a new password different from the current password.",
    400,
  );
  await limitRate("password-change", user.id, 6, 900);
  const loaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert(
    await verifyPassword(value.currentPassword, loaded.passwordHash),
    "INVALID_CREDENTIALS",
    "Password verification failed.",
    401,
  );
  const newHash = await hashPassword(value.newPassword);
  return atomic(async (tx) => {
    assert(token && token.length <= 128, "UNAUTHENTICATED", "Sign in to continue.", 401);
    const session = await tx.session.findUnique({
      where: { tokenHash: tokenDigest(token) },
      include: { user: true },
    });
    assert(
      session &&
        session.userId === user.id &&
        session.expiresAt > new Date() &&
        !session.user.suspended &&
        session.user.passwordHash === loaded.passwordHash &&
        (isDevelopment() || !session.user.isDemo),
      "UNAUTHENTICATED",
      "Sign in to continue.",
      401,
    );
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    const revoked = await tx.session.deleteMany({
      where: { userId: user.id, id: { not: session.id } },
    });
    await tx.session.update({
      where: { id: session.id },
      data: { authenticatedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PASSWORD_CHANGED_OTHER_SESSIONS_REVOKED",
        targetId: user.id,
        details: { revokedOtherSessions: revoked.count },
      },
    });
    return { ok: true, revokedOtherSessions: revoked.count };
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
  const jar = await cookies();
  return userFromToken(jar.get(sessionCookieName())?.value ?? jar.get("ruvora_session")?.value);
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
