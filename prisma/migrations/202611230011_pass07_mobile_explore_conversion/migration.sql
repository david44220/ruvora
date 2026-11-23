-- Pass 07: Mobile-First PWA, Public Discovery Marketplace, Smart Routing, Bio-Link Click Telemetry & Live Webhook Inspector
-- Strictly additive forward migration preserving all immutable economic, ledger, attribution, and event history.

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "smartRouting" JSONB;

ALTER TABLE "WebhookEvent"
  ADD COLUMN IF NOT EXISTS "advertiserId" TEXT;

CREATE INDEX IF NOT EXISTS "WebhookEvent_advertiserId_createdAt_idx"
  ON "WebhookEvent"("advertiserId", "createdAt");

CREATE TABLE IF NOT EXISTS "ProfileLinkClick" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProfileLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfileLinkClick_userId_linkId_idx"
  ON "ProfileLinkClick"("userId", "linkId");

CREATE INDEX IF NOT EXISTS "ProfileLinkClick_userId_createdAt_idx"
  ON "ProfileLinkClick"("userId", "createdAt");

ALTER TABLE "ProfileLinkClick"
  ADD CONSTRAINT "ProfileLinkClick_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
