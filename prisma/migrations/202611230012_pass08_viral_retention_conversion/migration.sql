-- Pass 08: Viral Social Sharing, Mobile Offer Bridge, Content Planner, XP Leaderboard Opt-In & Notification Preferences
-- Purely additive forward migration preserving all immutable economic, ledger, attribution, and audit history.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB,
  ADD COLUMN IF NOT EXISTS "lastWeeklyDigestAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_leaderboardOptIn_idx"
  ON "User"("leaderboardOptIn");

ALTER TABLE "ShareLink"
  ADD COLUMN IF NOT EXISTS "customSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "bridgeEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "ShareLink_customSlug_key"
  ON "ShareLink"("customSlug");

CREATE TABLE IF NOT EXISTS "CreatorPostPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT,
  "socialChannel" TEXT NOT NULL DEFAULT 'INSTAGRAM_STORY',
  "title" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "note" TEXT NOT NULL DEFAULT '',
  "checklist" JSONB NOT NULL DEFAULT '{"linkReady":false,"codeCopied":false,"disclosureIncluded":true}',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreatorPostPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorPostPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreatorPostPlan_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreatorPostPlan_userId_scheduledFor_idx"
  ON "CreatorPostPlan"("userId", "scheduledFor");

CREATE INDEX IF NOT EXISTS "CreatorPostPlan_userId_status_idx"
  ON "CreatorPostPlan"("userId", "status");
