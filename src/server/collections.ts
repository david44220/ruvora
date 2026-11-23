import { z } from "zod";
import type { User } from "@prisma/client";
import { COLLECTION_THEMES, isCollectionSlug, slugifyCollectionTitle } from "../lib/collections";
import { atomic, db } from "./db";
import { AppError, assert } from "./errors";
import { isDevelopment } from "./environment";
import { getCreatorCampaignEntry, getProfileEntry, getReferralEntry } from "./attribution";
import { canCreatorPromote } from "./campaign-eligibility";
import { getCreatorRetentionSummary } from "./retention";

const collectionItemInputSchema = z
  .object({
    campaignId: z.string().min(5).max(80),
    creatorNote: z.string().trim().max(220).optional().default(""),
  })
  .strict();

const upsertCollectionSchema = z
  .object({
    id: z.string().min(5).max(80).optional(),
    slug: z.string().trim().toLowerCase().min(3).max(40).optional(),
    title: z.string().trim().min(2).max(70),
    description: z.string().trim().max(260).optional().default(""),
    theme: z.enum(COLLECTION_THEMES).optional().default("obsidian"),
    published: z.boolean().optional().default(true),
    items: z.array(collectionItemInputSchema).min(1).max(6),
  })
  .strict();

export interface PublicCollectionItem {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  objective: string;
  creatorNote: string;
  disclosureNote: string;
  url: string;
  offerUrl: string;
  promoCode: string | null;
  discountLabel: string | null;
  budgetRemainingPct: number;
  isDemo: boolean;
}

export interface PublicCollectionData {
  collection: {
    id: string;
    slug: string;
    title: string;
    description: string;
    theme: string;
    viewsCount: number;
    updatedAt: string;
  };
  creator: {
    handle: string;
    displayName: string;
    bio: string;
    category: string;
    followers: number;
    audienceStatus: string;
    audienceVerifiedPlatform: string | null;
    audienceCaptureEnabled: boolean;
    audienceCapturePrompt: string;
    streakWeeks: number;
    badges: { code: string; labelKey: string }[];
    isDemo: boolean;
  };
  entry: { slug: string; url: string } | null;
  referralEntry: { slug: string; url: string } | null;
  items: PublicCollectionItem[];
  development: boolean;
}

/** Lists all multi-offer collections owned by the authenticated creator. */
export async function listCreatorCollections(user: User) {
  const fresh = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, handle: true },
  });
  const rows = await db.creatorCollection.findMany({
    where: { creatorId: user.id },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          campaign: {
            select: { id: true, name: true, objective: true, state: true, isDemo: true },
          },
        },
      },
    },
  });
  return {
    handle: fresh.handle,
    collections: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      theme: c.theme,
      published: c.published,
      viewsCount: c.viewsCount,
      publicUrl: fresh.handle ? `/c/${fresh.handle}/${c.slug}` : null,
      updatedAt: c.updatedAt.toISOString(),
      items: c.items.map((it) => ({
        id: it.id,
        campaignId: it.campaignId,
        creatorNote: it.creatorNote,
        sortOrder: it.sortOrder,
        campaignName: it.campaign.name,
        objective: it.campaign.objective,
        state: it.campaign.state,
      })),
    })),
  };
}

/** Creates or updates a creator's shareable multi-offer collection (strictly 0 EUR / 0 RU). */
export async function upsertCreatorCollection(user: User, input: unknown) {
  const value = upsertCollectionSchema.parse(input);
  const slug = value.slug ? value.slug.trim().toLowerCase() : slugifyCollectionTitle(value.title);
  assert(
    isCollectionSlug(slug),
    "INVALID_COLLECTION_SLUG",
    "Use 3 to 40 lowercase letters, digits or hyphens for a collection slug.",
    400,
  );

  // Deduplicate campaignIds while preserving creator sort order.
  const seen = new Set<string>();
  const uniqueItems: { campaignId: string; creatorNote: string }[] = [];
  for (const item of value.items) {
    if (seen.has(item.campaignId)) continue;
    seen.add(item.campaignId);
    uniqueItems.push({ campaignId: item.campaignId, creatorNote: item.creatorNote });
  }
  assert(uniqueItems.length >= 1, "VALIDATION_ERROR", "Select at least one active campaign.", 400);

  return atomic(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(fresh.handle, "PROFILE_NOT_FOUND", "Create your public Ruvora handle first.", 400);
    assert(!fresh.suspended && !fresh.economicHold, "ECONOMIC_HOLD", "Account unavailable.", 403);

    const campaigns = await tx.campaign.findMany({
      where: {
        id: { in: uniqueItems.map((i) => i.campaignId) },
        state: "ACTIVE",
        ...(isDevelopment() ? {} : { isDemo: false }),
      },
    });
    const byId = new Map(campaigns.map((c) => [c.id, c]));
    for (const item of uniqueItems) {
      const camp = byId.get(item.campaignId);
      assert(camp, "CAMPAIGN_INACTIVE", "All collection campaigns must be active.", 409);
      assert(
        camp.advertiserId !== fresh.id,
        "SELF_ATTRIBUTION",
        "You cannot add your own advertiser campaign to a creator collection.",
        403,
      );
      if (fresh.roles.includes("CREATOR")) {
        assert(
          canCreatorPromote(fresh, camp),
          "CREATOR_CAMPAIGN_INELIGIBLE",
          "One of the selected campaigns does not match your eligibility criteria.",
          403,
        );
      }
    }

    let collectionId = value.id;
    if (collectionId) {
      const existing = await tx.creatorCollection.findUnique({ where: { id: collectionId } });
      assert(
        existing && existing.creatorId === fresh.id,
        "COLLECTION_NOT_FOUND",
        "This offer collection is not available.",
        404,
      );
      const slugConflict = await tx.creatorCollection.findUnique({
        where: { creatorId_slug: { creatorId: fresh.id, slug } },
      });
      assert(
        !slugConflict || slugConflict.id === existing.id,
        "VANITY_SLUG_TAKEN",
        "You already have a collection with this slug.",
        409,
      );
      await tx.creatorCollection.update({
        where: { id: existing.id },
        data: {
          slug,
          title: value.title,
          description: value.description,
          theme: value.theme,
          published: value.published,
        },
      });
      await tx.creatorCollectionItem.deleteMany({ where: { collectionId: existing.id } });
    } else {
      const existingBySlug = await tx.creatorCollection.findUnique({
        where: { creatorId_slug: { creatorId: fresh.id, slug } },
      });
      if (existingBySlug) {
        collectionId = existingBySlug.id;
        await tx.creatorCollection.update({
          where: { id: existingBySlug.id },
          data: {
            title: value.title,
            description: value.description,
            theme: value.theme,
            published: value.published,
          },
        });
        await tx.creatorCollectionItem.deleteMany({ where: { collectionId: existingBySlug.id } });
      } else {
        const count = await tx.creatorCollection.count({ where: { creatorId: fresh.id } });
        assert(count < 12, "COLLECTION_LIMIT", "You can maintain up to 12 offer collections.", 409);
        const created = await tx.creatorCollection.create({
          data: {
            creatorId: fresh.id,
            slug,
            title: value.title,
            description: value.description,
            theme: value.theme,
            published: value.published,
          },
        });
        collectionId = created.id;
      }
    }

    await tx.creatorCollectionItem.createMany({
      data: uniqueItems.map((it, idx) => ({
        collectionId: collectionId!,
        campaignId: it.campaignId,
        creatorNote: it.creatorNote,
        sortOrder: idx,
      })),
    });

    await tx.auditLog.create({
      data: {
        actorId: fresh.id,
        action: "CREATOR_COLLECTION_SAVED",
        targetId: collectionId,
        details: { slug, itemCount: uniqueItems.length, published: value.published },
      },
    });

    return {
      id: collectionId,
      slug,
      publicUrl: `/c/${fresh.handle}/${slug}`,
      itemCount: uniqueItems.length,
    };
  });
}

/** Deletes a creator-owned multi-offer collection. */
export async function deleteCreatorCollection(user: User, collectionId: string) {
  return atomic(async (tx) => {
    const existing = await tx.creatorCollection.findUnique({ where: { id: collectionId } });
    assert(
      existing && existing.creatorId === user.id,
      "COLLECTION_NOT_FOUND",
      "This offer collection is not available.",
      404,
    );
    await tx.creatorCollection.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATOR_COLLECTION_DELETED",
        targetId: existing.id,
        details: { slug: existing.slug },
      },
    });
    return { deleted: true, id: existing.id };
  });
}

/** Loads a public multi-offer collection SSR view (/c/[handle]/[slug]) with server-signed /go links. */
export async function getPublicCollection(
  rawHandle: string,
  rawSlug: string,
): Promise<PublicCollectionData> {
  const handle = rawHandle.replace(/^@/, "").trim().toLowerCase();
  const slug = rawSlug.trim().toLowerCase();
  assert(
    /^[a-z0-9_]{3,24}$/.test(handle) && isCollectionSlug(slug),
    "COLLECTION_NOT_FOUND",
    "This offer collection is not available.",
    404,
  );
  const dev = isDevelopment();
  const creator = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      bio: true,
      category: true,
      followers: true,
      audienceStatus: true,
      audienceVerifiedPlatform: true,
      audienceCaptureEnabled: true,
      audienceCapturePrompt: true,
      suspended: true,
      isDemo: true,
    },
  });
  assert(
    creator && creator.handle && !creator.suspended && (dev || !creator.isDemo),
    "COLLECTION_NOT_FOUND",
    "This offer collection is not available.",
    404,
  );

  const collection = await db.creatorCollection.findUnique({
    where: { creatorId_slug: { creatorId: creator.id, slug } },
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              description: true,
              objective: true,
              state: true,
              startAt: true,
              endAt: true,
              budgetMinor: true,
              unitCostMinor: true,
              creativeBrief: true,
              isDemo: true,
            },
          },
        },
      },
    },
  });
  assert(
    collection && collection.published,
    "COLLECTION_NOT_FOUND",
    "This offer collection is not available.",
    404,
  );

  // Best-effort telemetry-only view counter (strictly 0 EUR / 0 RU).
  await db.creatorCollection
    .update({ where: { id: collection.id }, data: { viewsCount: { increment: 1 } } })
    .catch(() => {});

  const now = new Date();
  const activeRows = collection.items.filter(
    (it) =>
      it.campaign.state === "ACTIVE" &&
      it.campaign.startAt <= now &&
      it.campaign.endAt > now &&
      (dev || !it.campaign.isDemo),
  );

  const campaignIds = activeRows.map((r) => r.campaignId);
  const [escrowSums, promoCodes, retention] = await Promise.all([
    campaignIds.length
      ? db.ledgerEntry.groupBy({
          by: ["accountId"],
          where: { accountId: { in: campaignIds.map((id) => `campaign:${id}`) } },
          _sum: { amountMinor: true },
        })
      : Promise.resolve([]),
    campaignIds.length
      ? db.promoCode.findMany({
          where: { creatorId: creator.id, campaignId: { in: campaignIds }, active: true },
          select: { campaignId: true, code: true, discountLabel: true },
        })
      : Promise.resolve([]),
    getCreatorRetentionSummary(creator.id),
  ]);

  const escrowByAccount = new Map(
    escrowSums.map((row) => [row.accountId, row._sum.amountMinor ?? 0n]),
  );
  const promoByCampaign = new Map(promoCodes.map((p) => [p.campaignId, p]));

  let entry: { slug: string; url: string } | null = null;
  let referralEntry: { slug: string; url: string } | null = null;
  try {
    entry = await getProfileEntry(creator.handle);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
  }
  try {
    referralEntry = await getReferralEntry(creator.handle);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
  }

  const items: PublicCollectionItem[] = [];
  for (const row of activeRows) {
    const remaining = escrowByAccount.get(`campaign:${row.campaignId}`) ?? 0n;
    if (remaining < row.campaign.unitCostMinor) continue;
    let url = `/offers/${row.campaignId}`;
    try {
      const share = await getCreatorCampaignEntry(creator.handle, row.campaignId);
      url = share.url;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
    }
    const promo = promoByCampaign.get(row.campaignId);
    const brief = row.campaign.creativeBrief as { disclosureNote?: string } | null;
    const pct =
      row.campaign.budgetMinor > 0n
        ? Math.max(0, Math.min(100, Number((remaining * 100n) / row.campaign.budgetMinor)))
        : 0;
    items.push({
      id: row.id,
      campaignId: row.campaignId,
      name: row.campaign.name,
      description: row.campaign.description,
      objective: row.campaign.objective,
      creatorNote: row.creatorNote,
      disclosureNote: brief?.disclosureNote ?? "",
      url,
      offerUrl: `/offers/${row.campaignId}`,
      promoCode: promo?.code ?? null,
      discountLabel: promo?.discountLabel ?? null,
      budgetRemainingPct: pct,
      isDemo: row.campaign.isDemo,
    });
  }

  return {
    collection: {
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      description: collection.description,
      theme: collection.theme,
      viewsCount: collection.viewsCount + 1,
      updatedAt: collection.updatedAt.toISOString(),
    },
    creator: {
      handle: creator.handle,
      displayName: creator.displayName,
      bio: creator.bio,
      category: creator.category,
      followers: creator.followers,
      audienceStatus: creator.audienceStatus,
      audienceVerifiedPlatform: creator.audienceVerifiedPlatform,
      audienceCaptureEnabled: creator.audienceCaptureEnabled,
      audienceCapturePrompt: creator.audienceCapturePrompt,
      streakWeeks: retention.streak.currentStreakWeeks,
      badges: retention.badges,
      isDemo: creator.isDemo,
    },
    entry,
    referralEntry,
    items,
    development: dev,
  };
}
