-- Pass 05: Platform completeness (strict forward-only additive migration)
-- Preserves all finalized Pass 01-04 economic, ledger, attribution, and security history.

ALTER TYPE "AccountKind" ADD VALUE IF NOT EXISTS 'PAYOUT_PENDING';
ALTER TYPE "AccountKind" ADD VALUE IF NOT EXISTS 'PAYOUT_SETTLED';

ALTER TABLE "User"
  ADD COLUMN "directoryOptIn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "kycStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "billingEntityName" TEXT,
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "anonymizedAt" TIMESTAMP(3);

ALTER TABLE "Campaign"
  ADD COLUMN "maxActivitiesPerCreator" INTEGER,
  ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Activity"
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "disputeOriginActivityId" TEXT;

ALTER TABLE "AttributionContext"
  ADD COLUMN "abVariantId" TEXT;

ALTER TABLE "AdvertiserIntegration"
  ADD COLUMN "previousSealedSigningKey" TEXT,
  ADD COLUMN "previousKeyExpiresAt" TIMESTAMP(3);

CREATE TABLE "PasskeyCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKeySpki" TEXT NOT NULL,
  "algorithm" INTEGER NOT NULL DEFAULT -7,
  "signCount" BIGINT NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL DEFAULT 'Passkey',
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");

CREATE TABLE "PasskeyChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "purpose" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasskeyChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasskeyChallenge_challenge_key" ON "PasskeyChallenge"("challenge");
CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");

CREATE TABLE "PayoutRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "provider" TEXT NOT NULL DEFAULT 'development',
  "state" TEXT NOT NULL DEFAULT 'REQUESTED',
  "destinationSummary" TEXT NOT NULL,
  "destinationCiphertext" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reserveTransactionId" TEXT,
  "settleTransactionId" TEXT,
  "approvalId" TEXT,
  "reviewerId" TEXT,
  "reviewReason" TEXT,
  "externalReference" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutRequest_amountMinor_positive" CHECK ("amountMinor" >= 500 AND "currency" = 'EUR'),
  CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayoutRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayoutRequest_idempotencyKey_key" ON "PayoutRequest"("idempotencyKey");
CREATE UNIQUE INDEX "PayoutRequest_reserveTransactionId_key" ON "PayoutRequest"("reserveTransactionId");
CREATE UNIQUE INDEX "PayoutRequest_settleTransactionId_key" ON "PayoutRequest"("settleTransactionId");
CREATE INDEX "PayoutRequest_userId_createdAt_idx" ON "PayoutRequest"("userId", "createdAt");
CREATE INDEX "PayoutRequest_state_createdAt_idx" ON "PayoutRequest"("state", "createdAt");

CREATE TABLE "ActivityDispute" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceNote" TEXT NOT NULL DEFAULT '',
  "attachmentId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'OPEN',
  "originalReviewerId" TEXT,
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "reopenedActivityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ActivityDispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityDispute_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActivityDispute_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActivityDispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActivityDispute_reopenedActivityId_fkey" FOREIGN KEY ("reopenedActivityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActivityDispute_activityId_key" ON "ActivityDispute"("activityId");
CREATE UNIQUE INDEX "ActivityDispute_reopenedActivityId_key" ON "ActivityDispute"("reopenedActivityId");
CREATE INDEX "ActivityDispute_state_createdAt_idx" ON "ActivityDispute"("state", "createdAt");
CREATE INDEX "ActivityDispute_creatorId_createdAt_idx" ON "ActivityDispute"("creatorId", "createdAt");

CREATE TABLE "EvidenceAttachment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "activityId" TEXT,
  "disputeId" TEXT,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKind" TEXT NOT NULL DEFAULT 'LOCAL_SEALED',
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EvidenceAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceAttachment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "EvidenceAttachment_ownerId_createdAt_idx" ON "EvidenceAttachment"("ownerId", "createdAt");
CREATE INDEX "EvidenceAttachment_activityId_idx" ON "EvidenceAttachment"("activityId");

CREATE TABLE "CampaignInvitation" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "advertiserId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampaignInvitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignInvitation_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignInvitation_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignInvitation_campaignId_creatorId_key" ON "CampaignInvitation"("campaignId", "creatorId");
CREATE INDEX "CampaignInvitation_creatorId_state_createdAt_idx" ON "CampaignInvitation"("creatorId", "state", "createdAt");

CREATE TABLE "UgcDeliverable" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'APPLIED',
  "pitch" TEXT NOT NULL DEFAULT '',
  "draftUrl" TEXT,
  "publishedUrl" TEXT,
  "feedback" TEXT,
  "activityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UgcDeliverable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UgcDeliverable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UgcDeliverable_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UgcDeliverable_campaignId_creatorId_key" ON "UgcDeliverable"("campaignId", "creatorId");
CREATE INDEX "UgcDeliverable_campaignId_state_idx" ON "UgcDeliverable"("campaignId", "state");
CREATE INDEX "UgcDeliverable_creatorId_state_idx" ON "UgcDeliverable"("creatorId", "state");

CREATE TABLE "AudienceVerificationSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "handleUrl" TEXT NOT NULL,
  "declaredFollowers" INTEGER NOT NULL,
  "provenance" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudienceVerificationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AudienceVerificationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AudienceVerificationSnapshot_userId_verifiedAt_idx" ON "AudienceVerificationSnapshot"("userId", "verifiedAt");
