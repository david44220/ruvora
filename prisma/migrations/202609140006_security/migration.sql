-- Forward-only Pass02 security and provider foundations.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "authenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE TABLE "MfaCredential" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "secretCiphertext" TEXT NOT NULL,
  "lastAcceptedCounter" BIGINT NOT NULL DEFAULT -1,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3)
);
CREATE TABLE "MfaEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MfaRecoveryCode" (
  "digest" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "EmailSecurityToken" (
  "digest" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MailOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "payloadCiphertext" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "providerReference" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "FinancialApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requesterId" TEXT NOT NULL,
  "approverId" TEXT,
  "operation" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reviewReason" TEXT,
  "state" TEXT NOT NULL DEFAULT 'REQUESTED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PaymentOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "externalId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "state" TEXT NOT NULL DEFAULT 'REQUESTED',
  "parentId" TEXT,
  "ledgerTransactionId" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ProviderConversion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "convertedAt" TIMESTAMP(3) NOT NULL,
  "valueMinor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "decision" TEXT NOT NULL,
  "latestWebhookId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MfaEnrollment_userId_key" ON "MfaEnrollment" ("userId");
CREATE INDEX "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode" ("userId");
CREATE INDEX "EmailSecurityToken_userId_purpose_createdAt_idx" ON "EmailSecurityToken" ("userId", "purpose", "createdAt");
CREATE INDEX "EmailSecurityToken_expiresAt_idx" ON "EmailSecurityToken" ("expiresAt");
CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox" ("status", "nextAttemptAt");
CREATE INDEX "MailOutbox_userId_createdAt_idx" ON "MailOutbox" ("userId", "createdAt");
CREATE INDEX "FinancialApproval_state_createdAt_idx" ON "FinancialApproval" ("state", "createdAt");
CREATE INDEX "FinancialApproval_requesterId_createdAt_idx" ON "FinancialApproval" ("requesterId", "createdAt");
CREATE UNIQUE INDEX "PaymentOperation_idempotencyKey_key" ON "PaymentOperation" ("idempotencyKey");
CREATE UNIQUE INDEX "PaymentOperation_ledgerTransactionId_key" ON "PaymentOperation" ("ledgerTransactionId");
CREATE UNIQUE INDEX "PaymentOperation_provider_externalId_key" ON "PaymentOperation" ("provider", "externalId");
CREATE INDEX "PaymentOperation_userId_createdAt_idx" ON "PaymentOperation" ("userId", "createdAt");
CREATE INDEX "PaymentOperation_parentId_kind_idx" ON "PaymentOperation" ("parentId", "kind");
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent" ("provider", "externalId");
CREATE INDEX "WebhookEvent_status_nextAttemptAt_idx" ON "WebhookEvent" ("status", "nextAttemptAt");
CREATE UNIQUE INDEX "ProviderConversion_provider_externalId_key" ON "ProviderConversion" ("provider", "externalId");
CREATE UNIQUE INDEX "ProviderConversion_provider_activityId_key" ON "ProviderConversion" ("provider", "activityId");
CREATE INDEX "ProviderConversion_activityId_campaignId_idx" ON "ProviderConversion" ("activityId", "campaignId");
ALTER TABLE "MfaCredential" ADD CONSTRAINT "MfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaEnrollment" ADD CONSTRAINT "MfaEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSecurityToken" ADD CONSTRAINT "EmailSecurityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MailOutbox" ADD CONSTRAINT "MailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaEnrollment" ADD CONSTRAINT "MfaEnrollment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialApproval" ADD CONSTRAINT "FinancialApproval_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialApproval" ADD CONSTRAINT "FinancialApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PaymentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderConversion" ADD CONSTRAINT "ProviderConversion_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderConversion" ADD CONSTRAINT "ProviderConversion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderConversion" ADD CONSTRAINT "ProviderConversion_latestWebhookId_fkey" FOREIGN KEY ("latestWebhookId") REFERENCES "WebhookEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialApproval" ADD CONSTRAINT "approval_independent_reviewer" CHECK ("approverId" IS NULL OR "approverId" <> "requesterId");
ALTER TABLE "FinancialApproval" ADD CONSTRAINT "approval_state" CHECK ("state" IN ('REQUESTED','APPROVED','REJECTED','EXECUTED','EXPIRED'));
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "payment_positive_amount" CHECK ("amountMinor" > 0 AND "currency" = 'EUR');
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "payment_state" CHECK ("state" IN ('REQUESTED','CONFIRMED','REJECTED','REVERSED'));
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "webhook_state" CHECK ("status" IN ('RECEIVED','PROCESSING','PROCESSED','RETRY','DEAD_LETTER') AND "attempts" >= 0);
ALTER TABLE "MailOutbox" ADD CONSTRAINT "mail_state" CHECK ("status" IN ('PENDING','PROCESSING','DELIVERED','RETRY','DEAD_LETTER') AND "attempts" >= 0);
ALTER TABLE "EmailSecurityToken" ADD CONSTRAINT "email_token_purpose" CHECK ("purpose" IN ('VERIFY_EMAIL','RESET_PASSWORD'));
ALTER TABLE "ProviderConversion" ADD CONSTRAINT "conversion_decision" CHECK ("decision" IN ('VERIFIED','REJECTED','REVERSED') AND ("valueMinor" IS NULL OR "valueMinor" >= 0) AND "currency" = 'EUR');

CREATE FUNCTION protect_approval_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IN ('EXECUTED','REJECTED','EXPIRED') OR
    (to_jsonb(OLD) - ARRAY['approverId','reviewReason','state','reviewedAt','executedAt'])
      IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['approverId','reviewReason','state','reviewedAt','executedAt']) OR
    (OLD."state" = 'REQUESTED' AND NEW."state" NOT IN ('APPROVED','REJECTED','EXPIRED')) OR
    (OLD."state" = 'APPROVED' AND NEW."state" NOT IN ('EXECUTED','EXPIRED')) OR
    (OLD."state" = 'APPROVED' AND (OLD."approverId" IS DISTINCT FROM NEW."approverId" OR OLD."reviewReason" IS DISTINCT FROM NEW."reviewReason"))
  THEN RAISE EXCEPTION 'Approval history cannot be rewritten'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "FinancialApproval_guard" BEFORE UPDATE ON "FinancialApproval" FOR EACH ROW EXECUTE FUNCTION protect_approval_history();

CREATE FUNCTION protect_provider_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'WebhookEvent' AND
    (to_jsonb(OLD) - ARRAY['status','attempts','nextAttemptAt','lockedUntil','leaseToken','processedAt','lastErrorCode'])
      IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','attempts','nextAttemptAt','lockedUntil','leaseToken','processedAt','lastErrorCode'])
  THEN RAISE EXCEPTION 'Webhook identity cannot be rewritten'; END IF;
  IF TG_TABLE_NAME = 'ProviderConversion' AND
    ((to_jsonb(OLD) - ARRAY['decision','latestWebhookId','updatedAt'])
      IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['decision','latestWebhookId','updatedAt']) OR
      ((to_jsonb(OLD)->>'decision') IN ('REJECTED','REVERSED') AND (to_jsonb(NEW)->>'decision') <> (to_jsonb(OLD)->>'decision')))
  THEN RAISE EXCEPTION 'Conversion identity or terminal decision cannot be rewritten'; END IF;
  IF TG_TABLE_NAME = 'PaymentOperation' AND
    ((to_jsonb(OLD) - ARRAY['state','externalId','ledgerTransactionId','updatedAt'])
      IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','externalId','ledgerTransactionId','updatedAt']) OR (to_jsonb(OLD)->>'state') <> 'REQUESTED')
  THEN RAISE EXCEPTION 'Confirmed payment history cannot be rewritten'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "WebhookEvent_guard" BEFORE UPDATE ON "WebhookEvent" FOR EACH ROW EXECUTE FUNCTION protect_provider_identity();
CREATE TRIGGER "ProviderConversion_guard" BEFORE UPDATE ON "ProviderConversion" FOR EACH ROW EXECUTE FUNCTION protect_provider_identity();
CREATE TRIGGER "PaymentOperation_guard" BEFORE UPDATE ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION protect_provider_identity();


ALTER TABLE "PaymentOperation" ADD CONSTRAINT "confirmed_payment_has_ledger" CHECK ("state" <> 'CONFIRMED' OR "ledgerTransactionId" IS NOT NULL);
CREATE FUNCTION protect_security_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'MfaCredential' THEN
    IF (to_jsonb(NEW)->>'secretCiphertext') = (to_jsonb(OLD)->>'secretCiphertext') AND
      (to_jsonb(NEW)->>'lastAcceptedCounter')::BIGINT < (to_jsonb(OLD)->>'lastAcceptedCounter')::BIGINT THEN
      RAISE EXCEPTION 'Authenticator counter cannot move backwards';
    END IF;
  ELSE
    IF (to_jsonb(OLD) - 'consumedAt') IS DISTINCT FROM (to_jsonb(NEW) - 'consumedAt') OR
      (to_jsonb(OLD)->>'consumedAt') IS NOT NULL OR (to_jsonb(NEW)->>'consumedAt') IS NULL THEN
      RAISE EXCEPTION 'Consumed security credentials cannot be rewritten';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MfaCredential_counter_guard" BEFORE UPDATE ON "MfaCredential" FOR EACH ROW EXECUTE FUNCTION protect_security_consumption();
CREATE TRIGGER "EmailSecurityToken_consume_guard" BEFORE UPDATE ON "EmailSecurityToken" FOR EACH ROW EXECUTE FUNCTION protect_security_consumption();
CREATE TRIGGER "MfaRecoveryCode_consume_guard" BEFORE UPDATE ON "MfaRecoveryCode" FOR EACH ROW EXECUTE FUNCTION protect_security_consumption();
