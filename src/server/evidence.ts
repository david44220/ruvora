import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { assert } from "./errors";

export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024; // 2 MB

const uploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(120),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataBase64: z.string().min(16).max(3_000_000),
    activityId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

/**
 * Verifies actual magic bytes to reject disguised SVG/HTML/JS polyglots.
 */
export function detectVerifiedImageMime(
  buffer: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function evidenceRoot(): string {
  return resolve(process.cwd(), ".local", "evidence");
}

function safeFilename(raw: string, ext: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return cleaned.endsWith(ext) ? cleaned : `${cleaned}${ext}`;
}

export async function uploadEvidenceAttachment(user: User, input: unknown) {
  const value = uploadSchema.parse(input);
  const rawBase64 = value.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Buffer.from(rawBase64, "base64");
  assert(
    bytes.length > 0 && bytes.length <= MAX_EVIDENCE_BYTES,
    "EVIDENCE_TOO_LARGE",
    "Evidence image must be at most 2 MB.",
    413,
  );

  const detected = detectVerifiedImageMime(bytes);
  assert(
    detected && detected === value.mimeType,
    "INVALID_EVIDENCE_FORMAT",
    "Only verified PNG, JPEG, or WebP images are accepted.",
    400,
  );

  if (value.activityId) {
    const act = await db.activity.findUnique({ where: { id: value.activityId } });
    assert(
      act && (act.userId === user.id || act.creatorId === user.id),
      "ACTIVITY_NOT_FOUND",
      "Activity not found.",
      404,
    );
  }

  const ext = detected === "image/png" ? ".png" : detected === "image/jpeg" ? ".jpg" : ".webp";
  const id = randomUUID();
  const storageKey = `${id}${ext}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const dir = evidenceRoot();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storageKey), bytes);

  const record = await db.evidenceAttachment.create({
    data: {
      id,
      ownerId: user.id,
      activityId: value.activityId ?? null,
      filename: safeFilename(value.filename, ext),
      mimeType: detected,
      sizeBytes: bytes.length,
      sha256,
      storageKind: process.env.EVIDENCE_S3_BUCKET ? "S3_COMPATIBLE" : "LOCAL_SEALED",
      storageKey,
    },
  });

  return {
    id: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    url: `/api/evidence/${record.id}`,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function readEvidenceAttachment(user: User, attachmentId: string) {
  const record = await db.evidenceAttachment.findUnique({ where: { id: attachmentId } });
  assert(record, "ATTACHMENT_NOT_FOUND", "Evidence attachment not found.", 404);
  assert(
    record.ownerId === user.id || user.roles.includes("ADMIN"),
    "FORBIDDEN",
    "Only the owner or an administrator can access this attachment.",
    403,
  );
  // Guard against any path traversal
  assert(
    /^[a-zA-Z0-9-]+\.(png|jpg|webp)$/.test(record.storageKey),
    "INVALID_STORAGE_KEY",
    "Invalid storage key.",
    500,
  );
  const bytes = await readFile(join(evidenceRoot(), record.storageKey));
  return { record, bytes };
}

export async function listUserEvidence(user: User) {
  const rows = await db.evidenceAttachment.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    activityId: r.activityId,
    url: `/api/evidence/${r.id}`,
    createdAt: r.createdAt.toISOString(),
  }));
}
