import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue } from "../db";
import { assert } from "../errors";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const confirmRegisterSchema = z
  .object({
    challenge: z.string().min(16).max(256),
    credentialId: z.string().trim().min(8).max(512),
    publicKeySpki: z.string().min(32).max(2048),
    algorithm: z
      .number()
      .int()
      .refine((v) => v === -7 || v === -257, "Only ES256 (-7) or RS256 (-257) supported"),
    label: z.string().trim().min(1).max(80).default("Passkey"),
    transports: z.array(z.string().trim().max(32)).max(6).default([]),
    clientDataJSON: z.string().min(16).max(4096),
  })
  .strict();

const verifyAssertionSchema = z
  .object({
    challenge: z.string().min(16).max(256),
    credentialId: z.string().trim().min(8).max(512),
    clientDataJSON: z.string().min(16).max(4096),
    authenticatorData: z.string().min(32).max(4096),
    signature: z.string().min(32).max(4096),
  })
  .strict();

export function resolveWebAuthnRp() {
  const raw = process.env.APP_URL ?? "http://localhost:3000";
  const url = new URL(raw);
  return {
    rpId: url.hostname,
    origin: url.origin,
    rpName: "Ruvora",
  };
}

export async function beginPasskeyRegistration(user: User) {
  const challenge = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const existing = await db.passkeyCredential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  await db.passkeyChallenge.create({
    data: {
      userId: user.id,
      purpose: "REGISTER",
      challenge,
      expiresAt,
    },
  });

  const rp = resolveWebAuthnRp();
  return {
    challenge,
    rp: { id: rp.rpId, name: rp.rpName },
    user: {
      id: Buffer.from(user.id, "utf8").toString("base64url"),
      name: user.email,
      displayName: user.displayName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    excludeCredentials: existing.map((c) => ({
      type: "public-key",
      id: c.credentialId,
      transports: c.transports,
    })),
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  };
}

function parseAndValidateClientData(
  clientDataBase64Url: string,
  expectedType: "webauthn.create" | "webauthn.get",
  expectedChallenge: string,
): Buffer {
  const raw = Buffer.from(clientDataBase64Url, "base64url");
  let parsed: { type?: string; challenge?: string; origin?: string };
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw assert(false, "PASSKEY_INVALID_CLIENT_DATA", "Invalid WebAuthn clientDataJSON.", 400);
  }
  const rp = resolveWebAuthnRp();
  assert(
    parsed.type === expectedType,
    "PASSKEY_TYPE_MISMATCH",
    "Unexpected WebAuthn ceremony type.",
    400,
  );
  assert(
    parsed.challenge === expectedChallenge,
    "PASSKEY_CHALLENGE_MISMATCH",
    "WebAuthn challenge mismatch.",
    400,
  );
  assert(
    parsed.origin === rp.origin,
    "PASSKEY_ORIGIN_MISMATCH",
    "WebAuthn origin does not match canonical APP_URL.",
    403,
  );
  return raw;
}

export async function confirmPasskeyRegistration(user: User, input: unknown) {
  const value = confirmRegisterSchema.parse(input);
  parseAndValidateClientData(value.clientDataJSON, "webauthn.create", value.challenge);

  // Validate SPKI public key format eagerly using Node native crypto
  try {
    createPublicKey({
      key: Buffer.from(value.publicKeySpki, "base64url"),
      format: "der",
      type: "spki",
    });
  } catch {
    assert(false, "PASSKEY_INVALID_PUBLIC_KEY", "Invalid SPKI public key encoding.", 400);
  }

  return atomic(async (tx) => {
    const challengeRow = await tx.passkeyChallenge.findUnique({
      where: { challenge: value.challenge },
    });
    assert(
      challengeRow &&
        challengeRow.purpose === "REGISTER" &&
        challengeRow.userId === user.id &&
        !challengeRow.consumedAt &&
        challengeRow.expiresAt > new Date(),
      "PASSKEY_CHALLENGE_EXPIRED",
      "Passkey registration challenge is invalid or expired.",
      400,
    );

    await tx.passkeyChallenge.update({
      where: { id: challengeRow.id },
      data: { consumedAt: new Date() },
    });

    const created = await tx.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialId: value.credentialId,
        publicKeySpki: value.publicKeySpki,
        algorithm: value.algorithm,
        label: value.label,
        transports: value.transports,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PASSKEY_REGISTERED",
        targetId: created.id,
        details: jsonValue({ label: created.label, algorithm: created.algorithm }),
      },
    });

    return {
      id: created.id,
      label: created.label,
      algorithm: created.algorithm,
      createdAt: created.createdAt.toISOString(),
    };
  });
}

export async function beginPasskeyAuthentication(user?: User | null) {
  const challenge = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const allowCredentials = user
    ? (
        await db.passkeyCredential.findMany({
          where: { userId: user.id },
          select: { credentialId: true, transports: true },
        })
      ).map((c) => ({ type: "public-key", id: c.credentialId, transports: c.transports }))
    : [];

  await db.passkeyChallenge.create({
    data: {
      userId: user?.id ?? null,
      purpose: user ? "STEP_UP" : "LOGIN",
      challenge,
      expiresAt,
    },
  });

  const rp = resolveWebAuthnRp();
  return {
    challenge,
    rpId: rp.rpId,
    allowCredentials,
    timeout: 60_000,
    userVerification: "preferred",
  };
}

/**
 * Verifies a WebAuthn assertion (RP ID hash, UP flag, signCount monotonicity,
 * and native Node crypto ES256/RS256 signature over authenticatorData || SHA-256(clientDataJSON)).
 */
export async function verifyPasskeyAssertion(
  input: unknown,
  options?: { expectedUserId?: string; sessionTokenHash?: string },
) {
  const value = verifyAssertionSchema.parse(input);
  const clientDataRaw = parseAndValidateClientData(
    value.clientDataJSON,
    "webauthn.get",
    value.challenge,
  );
  const authData = Buffer.from(value.authenticatorData, "base64url");
  assert(authData.length >= 37, "PASSKEY_INVALID_AUTHDATA", "Invalid authenticatorData.", 400);

  const rp = resolveWebAuthnRp();
  const expectedRpIdHash = createHash("sha256").update(rp.rpId).digest();
  assert(
    authData.subarray(0, 32).equals(expectedRpIdHash),
    "PASSKEY_RPID_MISMATCH",
    "Authenticator RP ID hash mismatch.",
    403,
  );
  const flags = authData[32]!;
  assert((flags & 0x01) === 0x01, "PASSKEY_USER_NOT_PRESENT", "User presence flag required.", 403);
  const nextSignCount = BigInt(authData.readUInt32BE(33));

  const clientDataHash = createHash("sha256").update(clientDataRaw).digest();
  const signedPayload = Buffer.concat([authData, clientDataHash]);
  const signatureBytes = Buffer.from(value.signature, "base64url");

  return atomic(async (tx) => {
    const challengeRow = await tx.passkeyChallenge.findUnique({
      where: { challenge: value.challenge },
    });
    assert(
      challengeRow && !challengeRow.consumedAt && challengeRow.expiresAt > new Date(),
      "PASSKEY_CHALLENGE_EXPIRED",
      "Passkey challenge is invalid or expired.",
      400,
    );

    const cred = await tx.passkeyCredential.findUnique({
      where: { credentialId: value.credentialId },
      include: { user: true },
    });
    assert(
      cred && !cred.user.suspended,
      "PASSKEY_NOT_FOUND",
      "Passkey credential not recognized.",
      401,
    );
    if (options?.expectedUserId) {
      assert(
        cred.userId === options.expectedUserId,
        "FORBIDDEN",
        "Passkey belongs to another account.",
        403,
      );
    }

    // Clone / replay protection when authenticator tracks non-zero signCount
    if (cred.signCount > 0n || nextSignCount > 0n) {
      assert(
        nextSignCount > cred.signCount,
        "PASSKEY_REPLAY_DETECTED",
        "Passkey signature counter did not advance.",
        401,
      );
    }

    const publicKey = createPublicKey({
      key: Buffer.from(cred.publicKeySpki, "base64url"),
      format: "der",
      type: "spki",
    });
    const ok = cryptoVerify("sha256", signedPayload, publicKey, signatureBytes);
    assert(
      ok,
      "PASSKEY_INVALID_SIGNATURE",
      "Passkey cryptographic signature failed verification.",
      401,
    );

    await tx.passkeyChallenge.update({
      where: { id: challengeRow.id },
      data: { consumedAt: new Date() },
    });
    await tx.passkeyCredential.update({
      where: { id: cred.id },
      data: { signCount: nextSignCount, lastUsedAt: new Date() },
    });

    if (options?.sessionTokenHash) {
      await tx.session.updateMany({
        where: { tokenHash: options.sessionTokenHash, userId: cred.userId },
        data: { mfaVerifiedAt: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: cred.userId,
        action: "PASSKEY_VERIFIED",
        targetId: cred.id,
        details: jsonValue({ purpose: challengeRow.purpose }),
      },
    });

    return { user: cred.user, credentialId: cred.id };
  });
}

export async function listUserPasskeys(user: User) {
  const rows = await db.passkeyCredential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    algorithm: r.algorithm,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function deleteUserPasskey(user: User, passkeyId: string) {
  const existing = await db.passkeyCredential.findUnique({ where: { id: passkeyId } });
  assert(existing && existing.userId === user.id, "PASSKEY_NOT_FOUND", "Passkey not found.", 404);
  await db.passkeyCredential.delete({ where: { id: passkeyId } });
  return { deleted: true };
}
