-- Pass 09: Multi-Offer Shareable Collections, Double Opt-In Audience Capture & Saved Campaigns
-- Strictly additive migration preserving all finalized economic history and immutable ledger triggers.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "audienceCaptureEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "audienceCapturePrompt" TEXT NOT NULL DEFAULT '';

CREATE TABLE "CreatorCollection" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "theme" TEXT NOT NULL DEFAULT 'obsidian',
  "published" BOOLEAN NOT NULL DEFAULT true,
  "viewsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreatorCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorCollectionItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "creatorNote" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreatorCollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AudienceSubscriber" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "emailCiphertext" TEXT NOT NULL,
  "emailDigest" TEXT NOT NULL,
  "sourceSlug" TEXT NOT NULL DEFAULT 'profile',
  "locale" TEXT NOT NULL DEFAULT 'fr',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "confirmTokenDigest" TEXT,
  "unsubscribeTokenDigest" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "unsubscribedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AudienceSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedCampaign" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "lowCapacityNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreatorCollection_creatorId_slug_key" ON "CreatorCollection"("creatorId", "slug");
CREATE INDEX "CreatorCollection_creatorId_published_idx" ON "CreatorCollection"("creatorId", "published");

CREATE UNIQUE INDEX "CreatorCollectionItem_collectionId_campaignId_key" ON "CreatorCollectionItem"("collectionId", "campaignId");
CREATE INDEX "CreatorCollectionItem_collectionId_sortOrder_idx" ON "CreatorCollectionItem"("collectionId", "sortOrder");

CREATE UNIQUE INDEX "AudienceSubscriber_confirmTokenDigest_key" ON "AudienceSubscriber"("confirmTokenDigest");
CREATE UNIQUE INDEX "AudienceSubscriber_unsubscribeTokenDigest_key" ON "AudienceSubscriber"("unsubscribeTokenDigest");
CREATE UNIQUE INDEX "AudienceSubscriber_creatorId_emailDigest_key" ON "AudienceSubscriber"("creatorId", "emailDigest");
CREATE INDEX "AudienceSubscriber_creatorId_status_createdAt_idx" ON "AudienceSubscriber"("creatorId", "status", "createdAt");

CREATE UNIQUE INDEX "SavedCampaign_userId_campaignId_key" ON "SavedCampaign"("userId", "campaignId");
CREATE INDEX "SavedCampaign_userId_createdAt_idx" ON "SavedCampaign"("userId", "createdAt");
CREATE INDEX "SavedCampaign_campaignId_idx" ON "SavedCampaign"("campaignId");

ALTER TABLE "CreatorCollection"
  ADD CONSTRAINT "CreatorCollection_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreatorCollectionItem"
  ADD CONSTRAINT "CreatorCollectionItem_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "CreatorCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreatorCollectionItem"
  ADD CONSTRAINT "CreatorCollectionItem_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudienceSubscriber"
  ADD CONSTRAINT "AudienceSubscriber_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedCampaign"
  ADD CONSTRAINT "SavedCampaign_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedCampaign"
  ADD CONSTRAINT "SavedCampaign_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
