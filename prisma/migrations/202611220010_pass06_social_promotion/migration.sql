-- Pass 06: Social Promotion & Viral Monetization Engine
-- Additive, non-destructive forward migration preserving all Pass 01-05 history & triggers.

ALTER TABLE "ShareLink"
  ADD COLUMN IF NOT EXISTS "socialChannel" TEXT NOT NULL DEFAULT 'DIRECT';

ALTER TABLE "AttributionContext"
  ADD COLUMN IF NOT EXISTS "socialChannel" TEXT NOT NULL DEFAULT 'DIRECT';

ALTER TABLE "GrowthEvent"
  ADD COLUMN IF NOT EXISTS "socialChannel" TEXT NOT NULL DEFAULT 'DIRECT';

CREATE INDEX IF NOT EXISTS "ShareLink_creatorId_socialChannel_idx"
  ON "ShareLink"("creatorId", "socialChannel");

CREATE INDEX IF NOT EXISTS "AttributionContext_creatorId_socialChannel_idx"
  ON "AttributionContext"("creatorId", "socialChannel");

CREATE INDEX IF NOT EXISTS "GrowthEvent_creatorId_socialChannel_type_idx"
  ON "GrowthEvent"("creatorId", "socialChannel", "type");

CREATE TABLE IF NOT EXISTS "CreatorShowcaseItem" (
  "id"             TEXT NOT NULL,
  "creatorId"      TEXT NOT NULL,
  "campaignId"     TEXT NOT NULL,
  "collectionName" TEXT NOT NULL DEFAULT 'Picks',
  "creatorNote"    TEXT NOT NULL DEFAULT '',
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "pinned"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreatorShowcaseItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorShowcaseItem_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreatorShowcaseItem_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorShowcaseItem_creatorId_campaignId_key"
  ON "CreatorShowcaseItem"("creatorId", "campaignId");

CREATE INDEX IF NOT EXISTS "CreatorShowcaseItem_creatorId_pinned_sortOrder_idx"
  ON "CreatorShowcaseItem"("creatorId", "pinned", "sortOrder");
