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
  })
  .parse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
if (process.env.ALLOW_ADMIN_BOOTSTRAP !== "true")
  throw new Error("First-admin bootstrap requires explicit ALLOW_ADMIN_BOOTSTRAP=true.");
try {
  const passwordHash = await hashPassword(input.password);
  await atomic(async (tx) => {
    if (await tx.user.count({ where: { roles: { has: "ADMIN" } } }))
      throw new Error(
        "An administrator already exists. Bootstrap will not modify existing accounts or grant additional privileges.",
      );
    if (await tx.user.findUnique({ where: { email: input.email } }))
      throw new Error(
        "This email already has an account. Use a separate bootstrap address; existing accounts are never elevated by this script.",
      );
    const admin = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: "Ruvora Operations",
        roles: ["USER", "ADMIN"],
        locale: "en",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "FIRST_ADMIN_BOOTSTRAPPED",
        targetId: admin.id,
        details: { economicRulesInitialized: false },
      },
    });
  });
  console.log(
    "First administrator created. No demo data, economic rules or funds were initialized. Sign in, complete onboarding and configure explicit versioned economic policy before enabling participation.",
  );
} finally {
  await db.$disconnect();
}
