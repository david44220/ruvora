import "dotenv/config";
import { z } from "zod";
import { db, atomic } from "../src/server/db";
import { hashPassword } from "../src/server/security/password";

const input = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase().trim()),
    password: z.string().min(16).max(128),
    displayName: z.string().trim().min(2).max(60).default("Ruvora Operations Reviewer"),
  })
  .parse({
    email: process.env.PROVISION_ADMIN_EMAIL,
    password: process.env.PROVISION_ADMIN_PASSWORD,
    displayName: process.env.PROVISION_ADMIN_NAME || "Ruvora Operations Reviewer",
  });

if (process.env.ALLOW_ADMIN_PROVISION !== "true")
  throw new Error("Secondary administrator provisioning requires ALLOW_ADMIN_PROVISION=true.");

try {
  const passwordHash = await hashPassword(input.password);
  await atomic(async (tx) => {
    const existingAdminCount = await tx.user.count({
      where: { roles: { has: "ADMIN" }, isDemo: false },
    });
    if (existingAdminCount === 0)
      throw new Error(
        "No primary non-demo administrator exists yet. Run pnpm admin:bootstrap first.",
      );
    const existing = await tx.user.findUnique({ where: { email: input.email } });
    if (existing)
      throw new Error(
        "This email already has an account. Provision each independent administrator with a dedicated operations email.",
      );
    const admin = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        roles: ["USER", "ADMIN"],
        locale: "en",
        isDemo: false,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "SECONDARY_ADMIN_PROVISIONED",
        targetId: admin.id,
        details: { existingAdminCount },
      },
    });
  });
  console.log(
    "Independent administrator provisioned. Sign in, complete onboarding, verify email, and enroll TOTP MFA before authorizing dual-approval financial actions.",
  );
} finally {
  await db.$disconnect();
}
