-- Defense in depth. Application writes also use serializable transactions.
ALTER TABLE "Campaign" ADD CONSTRAINT "campaign_positive_budget" CHECK ("budgetMinor" > 0 AND "dailyBudgetMinor" > 0 AND "unitCostMinor" > 0 AND "unitCostMinor" <= "dailyBudgetMinor" AND "dailyBudgetMinor" <= "budgetMinor" AND "endAt" > "startAt" AND "frequencyCap" > 0 AND "currency" = 'EUR');
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "account_currency" CHECK ("currency" = 'EUR');
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "entry_nonzero" CHECK ("amountMinor" <> 0);
ALTER TABLE "RewardUnit" ADD CONSTRAINT "ru_positive" CHECK ("amountMicros" > 0);
ALTER TABLE "XpEntry" ADD CONSTRAINT "xp_direction" CHECK ((NOT "reversal" AND "amount" > 0) OR ("reversal" AND "amount" < 0));
ALTER TABLE "EventPoint" ADD CONSTRAINT "ep_direction" CHECK ((NOT "reversal" AND "amount" > 0) OR ("reversal" AND "amount" < 0));
ALTER TABLE "Referral" ADD CONSTRAINT "referral_no_self" CHECK ("inviterId" <> "inviteeId");
ALTER TABLE "Event" ADD CONSTRAINT "event_window" CHECK ("endAt" > "startAt");
ALTER TABLE "Distribution" ADD CONSTRAINT "distribution_window" CHECK ("endAt" > "startAt");
ALTER TABLE "Distribution" ADD CONSTRAINT "no_finalized_period_overlap" EXCLUDE USING gist (tsrange("startAt", "endAt", '[)') WITH &&) WHERE ("state" = 'FINALIZED');
CREATE UNIQUE INDEX "one_active_economic_rule" ON "EconomicRule" ((true)) WHERE "active" = true;
CREATE FUNCTION ruvora_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ruvora audit and financial records are append-only'; END;
$$;
CREATE TRIGGER "immutable_ledger_entries" BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_ledger_transactions" BEFORE UPDATE OR DELETE ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_ledger_accounts" BEFORE UPDATE OR DELETE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_audit" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_risk" BEFORE UPDATE OR DELETE ON "RiskEvent" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_xp" BEFORE UPDATE OR DELETE ON "XpEntry" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "immutable_ep" BEFORE UPDATE OR DELETE ON "EventPoint" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
CREATE TRIGGER "no_ru_deletion" BEFORE DELETE ON "RewardUnit" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
-- A committed operation cannot acquire additional entries, even a balanced pair.
ALTER TABLE "LedgerTransaction" ADD COLUMN "created_txid" bigint NOT NULL DEFAULT txid_current();
CREATE FUNCTION ruvora_guard_entry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LedgerTransaction" WHERE "id" = NEW."transactionId" AND "created_txid" = txid_current()) THEN RAISE EXCEPTION 'Entries must be posted in the transaction that creates their ledger operation'; END IF;
  PERFORM 1 FROM "LedgerAccount" WHERE "id" = NEW."accountId" FOR UPDATE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ledger_entry_operation_guard" BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_entry_insert();
CREATE FUNCTION ruvora_check_balanced_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_count integer; total numeric;
BEGIN
  SELECT count(*), coalesce(sum("amountMinor"), 0) INTO entry_count, total FROM "LedgerEntry" WHERE "transactionId" = NEW."id";
  IF entry_count < 2 OR total <> 0 THEN RAISE EXCEPTION 'Every ledger operation must contain at least two balanced entries'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ledger_balanced_at_commit" AFTER INSERT ON "LedgerTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ruvora_check_balanced_transaction();
CREATE FUNCTION ruvora_check_account_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_kind "AccountKind"; total numeric;
BEGIN
  SELECT "kind" INTO account_kind FROM "LedgerAccount" WHERE "id" = NEW."accountId";
  SELECT coalesce(sum("amountMinor"), 0) INTO total FROM "LedgerEntry" WHERE "accountId" = NEW."accountId";
  IF account_kind <> 'CASH_CLEARING' AND total < 0 THEN RAISE EXCEPTION 'Protected ledger account cannot be overdrawn'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ledger_nonnegative_at_commit" AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ruvora_check_account_balance();
CREATE FUNCTION ruvora_guard_reward_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."userId",NEW."activityId",NEW."category",NEW."amountMicros",NEW."ruleVersion",NEW."createdAt") IS DISTINCT FROM ROW(OLD."userId",OLD."activityId",OLD."category",OLD."amountMicros",OLD."ruleVersion",OLD."createdAt") THEN RAISE EXCEPTION 'Reward Unit provenance is immutable'; END IF;
  IF NOT ((OLD."state" = 'PENDING' AND NEW."state" IN ('VALIDATED','REJECTED')) OR (OLD."state" = 'VALIDATED' AND NEW."state" IN ('CONSUMED','REVERSED'))) THEN RAISE EXCEPTION 'Invalid Reward Unit lifecycle transition'; END IF;
  IF (NEW."state" = 'CONSUMED') <> (NEW."distributionId" IS NOT NULL) THEN RAISE EXCEPTION 'Consumed Reward Units require a distribution'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "reward_unit_lifecycle" BEFORE UPDATE ON "RewardUnit" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_reward_unit();
CREATE FUNCTION ruvora_guard_distribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" = 'FINALIZED' THEN RAISE EXCEPTION 'Finalized distribution history is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "immutable_finalized_distribution" BEFORE UPDATE OR DELETE ON "Distribution" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_distribution();
CREATE FUNCTION ruvora_guard_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."version" <> OLD."version" OR NEW."config" IS DISTINCT FROM OLD."config" OR NEW."createdAt" <> OLD."createdAt" THEN RAISE EXCEPTION 'Economic rules must be versioned, never overwritten'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "immutable_rule_content" BEFORE UPDATE ON "EconomicRule" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_rule();
CREATE TRIGGER "no_rule_deletion" BEFORE DELETE ON "EconomicRule" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
