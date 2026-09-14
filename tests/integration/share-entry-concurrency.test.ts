import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { atomic, db, jsonValue } from "../../src/server/db";
import { hashPassword } from "../../src/server/security/password";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import { getProfileEntry, getReferralEntry } from "../../src/server/attribution";
import { getPublicProfile } from "../../src/server/profiles";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe").pathname.endsWith("_test"))
  throw new Error(
    "Share entry concurrency tests require an isolated *_test database; history is preserved.",
  );
const tag = `share${randomUUID().replaceAll("-", "").slice(0, 8)}`;
let sequence = 0;
let passwordHash: string;
async function makeCreator() {
  const handle = `${tag}_${++sequence}`;
  return db.user.create({
    data: {
      email: `${handle}@integration.test`,
      passwordHash,
      displayName: handle,
      handle,
      roles: ["USER", "CREATOR"],
      country: "FR",
      category: "Design",
      onboarded: true,
      ageEligible: true,
      termsAcceptedAt: new Date(),
      emailVerifiedAt: new Date(),
      followers: 50,
      isDemo: true,
    },
  });
}
async function storedOrigins(ownerId: string) {
  return db.$queryRaw<
    { id: string; slug: string; canonicalKey: string; version: string; active: boolean }[]
  >`
    SELECT "id", "slug", "canonicalKey", xmin::text AS "version", "active"
    FROM "ShareLink" WHERE "ownerId" = ${ownerId} ORDER BY "canonicalKey"
  `;
}
function successes<T>(results: PromiseSettledResult<T>[]) {
  const failures = results.filter((result) => result.status === "rejected");
  expect(failures).toEqual([]);
  return results.map((result) => {
    if (result.status !== "fulfilled") throw result.reason;
    return result.value;
  });
}
beforeAll(async () => {
  process.env.APP_ENV = "development";
  passwordHash = await hashPassword("unused-share-concurrency-passphrase");
  await atomic(async (tx) => {
    await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
    await tx.economicRule.create({
      data: { version: `${tag}-rules`, config: jsonValue(DEVELOPMENT_RULES) },
    });
  });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("read-mostly public share origins", () => {
  it("converges concurrent first profile and referral requests on one immutable entry per source", async () => {
    for (let round = 0; round < 4; round++) {
      const creator = await makeCreator();
      const results = successes(
        await Promise.allSettled(
          Array.from({ length: 24 }, (_, index) =>
            index % 2 ? getReferralEntry(creator.handle!) : getProfileEntry(creator.handle!),
          ),
        ),
      );
      expect(
        new Set(results.filter((_, index) => index % 2 === 0).map((entry) => entry.slug)).size,
      ).toBe(1);
      expect(
        new Set(results.filter((_, index) => index % 2 === 1).map((entry) => entry.slug)).size,
      ).toBe(1);
      const origins = await db.shareLink.findMany({ where: { ownerId: creator.id } });
      expect(origins.map((origin) => origin.source).sort()).toEqual([
        "CREATOR_PROFILE",
        "REFERRAL",
      ]);
      expect(origins.every((origin) => origin.active && origin.creatorId === creator.id)).toBe(
        true,
      );
      expect(await db.attributionContext.count({ where: { creatorId: creator.id } })).toBe(0);
      expect(await db.growthEvent.count({ where: { creatorId: creator.id } })).toBe(0);
      expect(await db.rewardUnit.count({ where: { userId: creator.id } })).toBe(0);
    }
  }, 60_000);
  it("serves repeated concurrent first and existing public profile requests without rewriting stored origins", async () => {
    for (let round = 0; round < 2; round++) {
      const creator = await makeCreator();
      const first = successes(
        await Promise.allSettled(
          Array.from({ length: 8 }, () => getPublicProfile(creator.handle!)),
        ),
      );
      expect(
        first.every(
          (profile) =>
            profile.entry?.slug === first[0]!.entry?.slug &&
            profile.referralEntry?.slug === first[0]!.referralEntry?.slug,
        ),
      ).toBe(true);
      expect(first[0]!.entry).toBeTruthy();
      expect(first[0]!.referralEntry).toBeTruthy();
      const before = await storedOrigins(creator.id);
      for (let wave = 0; wave < 3; wave++) {
        const profiles = successes(
          await Promise.allSettled(
            Array.from({ length: 8 }, () => getPublicProfile(creator.handle!)),
          ),
        );
        expect(
          profiles.every(
            (profile) =>
              profile.entry?.slug === first[0]!.entry?.slug &&
              profile.referralEntry?.slug === first[0]!.referralEntry?.slug,
          ),
        ).toBe(true);
      }
      // PostgreSQL xmin changes even for a no-op UPDATE. Existing origins must be genuinely read-only.
      expect(await storedOrigins(creator.id)).toEqual(before);
      expect(await db.attributionContext.count({ where: { creatorId: creator.id } })).toBe(0);
      expect(await db.rewardUnit.count({ where: { userId: creator.id } })).toBe(0);
    }
  }, 60_000);
  it("never recreates or reactivates a revoked origin under concurrent reads", async () => {
    const creator = await makeCreator();
    const entry = await getProfileEntry(creator.handle!);
    await db.shareLink.update({ where: { slug: entry.slug }, data: { active: false } });
    const before = await storedOrigins(creator.id);
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => getProfileEntry(creator.handle!)),
    );
    expect(results).toHaveLength(16);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "SHARE_LINK_INACTIVE", status: 404 });
    }
    expect(await storedOrigins(creator.id)).toEqual(before);
  });
  it("rechecks current creator eligibility before returning an existing entry", async () => {
    const creator = await makeCreator();
    await getProfileEntry(creator.handle!);
    const before = await storedOrigins(creator.id);
    await db.user.update({ where: { id: creator.id }, data: { economicHold: true } });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => getProfileEntry(creator.handle!)),
    );
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "CREATOR_INELIGIBLE", status: 403 });
    }
    expect(await storedOrigins(creator.id)).toEqual(before);
  });
});
