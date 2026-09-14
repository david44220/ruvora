CREATE TYPE "AttributionSource" AS ENUM ('CREATOR_PROFILE','CREATOR_LINK','EVENT','REFERRAL','CAMPAIGN','SPONSORED_MISSION','SHARE_LINK','DIRECT');
CREATE TABLE "ShareLink" (
  "id" TEXT NOT NULL PRIMARY KEY, "slug" TEXT NOT NULL, "canonicalKey" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "creatorId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "referrerId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source" "AttributionSource" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "isDemo" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ShareLink_slug_key" ON "ShareLink"("slug");
CREATE UNIQUE INDEX "ShareLink_canonicalKey_key" ON "ShareLink"("canonicalKey");
CREATE INDEX "ShareLink_creatorId_source_idx" ON "ShareLink"("creatorId","source");
CREATE TABLE "AttributionContext" (
  "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "visitorHash" TEXT NOT NULL,
  "creatorId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "referrerId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "boundUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "shareLinkId" TEXT NOT NULL REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source" "AttributionSource" NOT NULL, "ruleVersion" TEXT NOT NULL, "policySnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "firstTouchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastTouchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "boundAt" TIMESTAMP(3), "isDemo" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "attribution_window" CHECK ("expiresAt" > "firstTouchAt" AND "expiresAt" <= "firstTouchAt" + INTERVAL '7 days'),
  CONSTRAINT "attribution_binding" CHECK (("boundUserId" IS NULL) = ("boundAt" IS NULL)),
  CONSTRAINT "attribution_no_self" CHECK ("boundUserId" IS NULL OR (("creatorId" IS NULL OR "creatorId" <> "boundUserId") AND ("referrerId" IS NULL OR "referrerId" <> "boundUserId"))),
  CONSTRAINT "attribution_status" CHECK ("status" IN ('ACTIVE','EXPIRED','REVOKED'))
);
CREATE UNIQUE INDEX "AttributionContext_tokenHash_key" ON "AttributionContext"("tokenHash");
CREATE INDEX "AttributionContext_visitorHash_expiresAt_idx" ON "AttributionContext"("visitorHash","expiresAt");
CREATE INDEX "AttributionContext_creatorId_firstTouchAt_idx" ON "AttributionContext"("creatorId","firstTouchAt");
CREATE INDEX "AttributionContext_boundUserId_expiresAt_idx" ON "AttributionContext"("boundUserId","expiresAt");
CREATE INDEX "AttributionContext_expiresAt_idx" ON "AttributionContext"("expiresAt");
ALTER TABLE "Activity" ADD COLUMN "attributionId" TEXT REFERENCES "AttributionContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD COLUMN "attributionSnapshot" JSONB, ADD COLUMN "requestFingerprint" TEXT;
CREATE INDEX "Activity_attributionId_idx" ON "Activity"("attributionId");
ALTER TABLE "Activity" ADD CONSTRAINT "activity_attribution_pair" CHECK (("attributionId" IS NULL) = ("attributionSnapshot" IS NULL));
ALTER TABLE "Activity" ADD CONSTRAINT "activity_fingerprint" CHECK ("requestFingerprint" IS NULL OR length("requestFingerprint") = 64);
ALTER TABLE "Referral" ADD COLUMN "attributionId" TEXT REFERENCES "AttributionContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD COLUMN "ruleSnapshot" JSONB, ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Referral_attributionId_key" ON "Referral"("attributionId");
CREATE TABLE "GrowthEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "dedupeKey" TEXT NOT NULL, "type" TEXT NOT NULL,
  "attributionId" TEXT REFERENCES "AttributionContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "shareLinkId" TEXT REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "creatorId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "isDemo" BOOLEAN NOT NULL DEFAULT false, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GrowthEvent_dedupeKey_key" ON "GrowthEvent"("dedupeKey");
CREATE INDEX "GrowthEvent_creatorId_type_occurredAt_idx" ON "GrowthEvent"("creatorId","type","occurredAt");
CREATE INDEX "GrowthEvent_type_occurredAt_idx" ON "GrowthEvent"("type","occurredAt");
CREATE INDEX "GrowthEvent_campaignId_type_idx" ON "GrowthEvent"("campaignId","type");
CREATE INDEX "GrowthEvent_eventId_type_idx" ON "GrowthEvent"("eventId","type");
CREATE TABLE "ReferralCredit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referralId" TEXT NOT NULL REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "activityId" TEXT NOT NULL REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rewardUnitId" TEXT NOT NULL REFERENCES "RewardUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "periodKey" TEXT NOT NULL, "amountMicros" BIGINT NOT NULL, "ruleVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_credit_positive" CHECK ("amountMicros" > 0)
);
CREATE UNIQUE INDEX "ReferralCredit_activityId_key" ON "ReferralCredit"("activityId");
CREATE UNIQUE INDEX "ReferralCredit_rewardUnitId_key" ON "ReferralCredit"("rewardUnitId");
CREATE INDEX "ReferralCredit_referralId_periodKey_idx" ON "ReferralCredit"("referralId","periodKey");
CREATE TRIGGER "immutable_referral_credit" BEFORE UPDATE OR DELETE ON "ReferralCredit" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_growth_event" BEFORE UPDATE ON "GrowthEvent" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "no_attribution_deletion" BEFORE DELETE ON "AttributionContext" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE FUNCTION ruvora_guard_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."id",NEW."tokenHash",NEW."visitorHash",NEW."creatorId",NEW."referrerId",NEW."shareLinkId",NEW."campaignId",NEW."eventId",NEW."source",NEW."ruleVersion",NEW."policySnapshot",NEW."firstTouchAt",NEW."expiresAt",NEW."isDemo") IS DISTINCT FROM ROW(OLD."id",OLD."tokenHash",OLD."visitorHash",OLD."creatorId",OLD."referrerId",OLD."shareLinkId",OLD."campaignId",OLD."eventId",OLD."source",OLD."ruleVersion",OLD."policySnapshot",OLD."firstTouchAt",OLD."expiresAt",OLD."isDemo") THEN RAISE EXCEPTION 'Attribution origin, token and economic policy are immutable'; END IF;
 IF OLD."boundUserId" IS NOT NULL AND ROW(NEW."boundUserId",NEW."boundAt") IS DISTINCT FROM ROW(OLD."boundUserId",OLD."boundAt") THEN RAISE EXCEPTION 'Attribution cannot move between accounts'; END IF;
 IF OLD."status" <> 'ACTIVE' AND NEW."status" <> OLD."status" THEN RAISE EXCEPTION 'Attribution cannot be reactivated'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "attribution_provenance" BEFORE UPDATE ON "AttributionContext" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_attribution();
CREATE FUNCTION ruvora_guard_referral() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."id",NEW."inviterId",NEW."inviteeId",NEW."attributionId",NEW."ruleSnapshot",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."inviterId",OLD."inviteeId",OLD."attributionId",OLD."ruleSnapshot",OLD."expiresAt",OLD."createdAt") THEN RAISE EXCEPTION 'Direct referral provenance is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "referral_provenance" BEFORE UPDATE ON "Referral" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_referral();
CREATE TRIGGER "no_referral_deletion" BEFORE DELETE ON "Referral" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE OR REPLACE FUNCTION ruvora_guard_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."id",NEW."userId",NEW."creatorId",NEW."campaignId",NEW."eventId",NEW."type",NEW."idempotencyKey",NEW."evidence",NEW."createdAt",NEW."attributionId",NEW."attributionSnapshot",NEW."requestFingerprint") IS DISTINCT FROM ROW(OLD."id",OLD."userId",OLD."creatorId",OLD."campaignId",OLD."eventId",OLD."type",OLD."idempotencyKey",OLD."evidence",OLD."createdAt",OLD."attributionId",OLD."attributionSnapshot",OLD."requestFingerprint") THEN RAISE EXCEPTION 'Activity provenance is immutable'; END IF;
 IF NOT ((OLD."state" = 'PENDING_VALIDATION' AND NEW."state" IN ('VALIDATED','REJECTED')) OR (OLD."state" = 'VALIDATED' AND NEW."state" = 'REVERSED')) THEN RAISE EXCEPTION 'Invalid activity lifecycle transition'; END IF;
 RETURN NEW;
END;
$$;
