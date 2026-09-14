ALTER TABLE "Event" ALTER COLUMN "artwork" SET DEFAULT '/assets/events/ruvora-event.webp';
UPDATE "Event" SET "artwork" = '/assets/events/ruvora-event.webp' WHERE "isDemo" = true AND "artwork" = '/assets/events/creator-rush.webp';
CREATE FUNCTION ruvora_guard_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id",NEW."userId",NEW."creatorId",NEW."campaignId",NEW."eventId",NEW."type",NEW."idempotencyKey",NEW."evidence",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."userId",OLD."creatorId",OLD."campaignId",OLD."eventId",OLD."type",OLD."idempotencyKey",OLD."evidence",OLD."createdAt") THEN RAISE EXCEPTION 'Activity provenance is immutable'; END IF;
  IF NOT ((OLD."state" = 'PENDING_VALIDATION' AND NEW."state" IN ('VALIDATED','REJECTED')) OR (OLD."state" = 'VALIDATED' AND NEW."state" = 'REVERSED')) THEN RAISE EXCEPTION 'Invalid activity lifecycle transition'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "activity_lifecycle" BEFORE UPDATE ON "Activity" FOR EACH ROW EXECUTE FUNCTION ruvora_guard_activity();
CREATE TRIGGER "no_activity_deletion" BEFORE DELETE ON "Activity" FOR EACH ROW EXECUTE FUNCTION ruvora_reject_mutation();
ALTER TABLE "Activity" ADD CONSTRAINT "activity_billing_state" CHECK (("state" IN ('PENDING_VALIDATION','REJECTED') AND "billableMinor" = 0) OR ("state" IN ('VALIDATED','REVERSED') AND "billableMinor" > 0 AND "validatedAt" IS NOT NULL AND "ruleVersion" IS NOT NULL));
