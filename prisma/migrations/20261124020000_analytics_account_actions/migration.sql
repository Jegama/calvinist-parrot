BEGIN;

CREATE TABLE "AnalyticsAccountAction" (
    kind TEXT NOT NULL CHECK (kind IN ('personal_journal', 'heritage_journal', 'sermon')),
    "sourceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (kind, "sourceId")
);
CREATE INDEX "AnalyticsAccountAction_occurredAt_idx" ON "AnalyticsAccountAction" ("occurredAt");

-- Capture saves/submissions in the originating transaction. Reprocessing an
-- existing entry or running a sermon worker updates rows and emits no save.
CREATE FUNCTION record_analytics_journal_save() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "AnalyticsAccountAction" (kind, "sourceId", "accountId", "occurredAt")
    SELECT CASE NEW."entryType" WHEN 'PERSONAL' THEN 'personal_journal' ELSE 'heritage_journal' END,
           NEW.id, p."appwriteUserId", NEW."createdAt"
    FROM "userProfile" p WHERE p.id = NEW."authorProfileId"
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;
CREATE TRIGGER analytics_journal_save AFTER INSERT ON "journalEntry"
    FOR EACH ROW EXECUTE FUNCTION record_analytics_journal_save();

CREATE FUNCTION record_analytics_sermon_submission() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "AnalyticsAccountAction" (kind, "sourceId", "accountId", "occurredAt")
    VALUES ('sermon', NEW.id, NEW."ownerId", NEW."createdAt") ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;
CREATE TRIGGER analytics_sermon_submission AFTER INSERT ON "sermonEvaluation"
    FOR EACH ROW EXECUTE FUNCTION record_analytics_sermon_submission();

-- Deleted entries cannot be reconstructed. Historical counts represent
-- retained rows with a known account; later deletion leaves receipts intact.
INSERT INTO "AnalyticsAccountAction" (kind, "sourceId", "accountId", "occurredAt")
SELECT CASE j."entryType" WHEN 'PERSONAL' THEN 'personal_journal' ELSE 'heritage_journal' END,
       j.id, p."appwriteUserId", j."createdAt"
FROM "journalEntry" j JOIN "userProfile" p ON p.id = j."authorProfileId"
ON CONFLICT DO NOTHING;
INSERT INTO "AnalyticsAccountAction" (kind, "sourceId", "accountId", "occurredAt")
SELECT 'sermon', id, "ownerId", "createdAt" FROM "sermonEvaluation" ON CONFLICT DO NOTHING;

COMMIT;
