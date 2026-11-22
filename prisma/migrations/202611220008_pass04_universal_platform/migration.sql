ALTER TABLE "User"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "preferredLanguages" TEXT[] NOT NULL DEFAULT ARRAY['fr', 'en']::TEXT[],
  ADD COLUMN "autoMonetize" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "profileTheme" TEXT NOT NULL DEFAULT 'obsidian',
  ADD COLUMN "audienceVerifyCode" TEXT,
  ADD COLUMN "audienceVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "audienceVerifiedPlatform" TEXT,
  ADD COLUMN "audienceVerifiedSource" TEXT;

ALTER TABLE "Campaign"
  ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "maximumCreatorFollowers" INTEGER,
  ADD COLUMN "allowedCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allowedLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allowedPlatforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requireVerifiedAudience" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minimumReliabilityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "creativeBrief" JSONB,
  ADD COLUMN "abVariants" JSONB;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_maximumCreatorFollowers_check" CHECK ("maximumCreatorFollowers" IS NULL OR "maximumCreatorFollowers" >= 0),
  ADD CONSTRAINT "Campaign_minimumReliabilityScore_check" CHECK ("minimumReliabilityScore" >= 0 AND "minimumReliabilityScore" <= 100),
  ADD CONSTRAINT "Campaign_deliveryMode_check" CHECK ("deliveryMode" IN ('OPEN', 'UGC_BRIEF'));

ALTER TABLE "Activity"
  ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "riskSignals" JSONB,
  ADD COLUMN "abVariantId" TEXT,
  ADD COLUMN "promoCodeUsed" TEXT;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_riskScore_check" CHECK ("riskScore" >= 0 AND "riskScore" <= 100);

CREATE TABLE "QuestClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questCode" TEXT NOT NULL,
  "xpAwarded" INTEGER NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestClaim_xpAwarded_check" CHECK ("xpAwarded" > 0)
);

CREATE UNIQUE INDEX "QuestClaim_userId_questCode_key" ON "QuestClaim"("userId", "questCode");
CREATE INDEX "QuestClaim_userId_claimedAt_idx" ON "QuestClaim"("userId", "claimedAt");

ALTER TABLE "QuestClaim"
  ADD CONSTRAINT "QuestClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PromoCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "discountLabel" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "usesCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoCode_usesCount_check" CHECK ("usesCount" >= 0)
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE UNIQUE INDEX "PromoCode_creatorId_campaignId_key" ON "PromoCode"("creatorId", "campaignId");
CREATE INDEX "PromoCode_campaignId_active_idx" ON "PromoCode"("campaignId", "active");

ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PromoCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "titleKey" TEXT NOT NULL,
  "bodyParams" JSONB NOT NULL DEFAULT '{}',
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdvertiserIntegration" (
  "id" TEXT NOT NULL,
  "advertiserId" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "sealedSigningKey" TEXT NOT NULL,
  "signingKeyDigest" TEXT NOT NULL,
  "lastRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertiserIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvertiserIntegration_advertiserId_key" ON "AdvertiserIntegration"("advertiserId");

ALTER TABLE "AdvertiserIntegration"
  ADD CONSTRAINT "AdvertiserIntegration_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMember_role_check" CHECK ("role" IN ('CAMPAIGN_MANAGER', 'BILLING', 'VIEWER'))
);

CREATE UNIQUE INDEX "WorkspaceMember_ownerId_memberId_key" ON "WorkspaceMember"("ownerId", "memberId");
CREATE INDEX "WorkspaceMember_memberId_idx" ON "WorkspaceMember"("memberId");

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkspaceMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
