BEGIN;

CREATE TABLE "AnalyticsJournalCompletion" (
    feature TEXT NOT NULL CHECK (feature IN ('personal_journal', 'heritage_journal')),
    "operationId" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (feature, "operationId")
);
CREATE INDEX "AnalyticsJournalCompletion_completedAt_idx" ON "AnalyticsJournalCompletion" ("completedAt");

-- Write in the transaction that persists the completed output. Replays and
-- partial checkpoints do not count. No journal text or provider receipt is needed.
CREATE FUNCTION record_analytics_journal_completion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    entry "journalEntry"%ROWTYPE;
    feature_name TEXT;
    operation_id TEXT;
BEGIN
    SELECT id, "entryType", "heritageOperationId"
    INTO entry.id, entry."entryType", entry."heritageOperationId"
    FROM "journalEntry" WHERE id = NEW."entryId";

    IF entry."entryType" = 'PERSONAL' THEN
        IF NEW."modelInfo"->>'status' IS DISTINCT FROM 'complete'
           OR (TG_OP = 'UPDATE' AND OLD."modelInfo"->>'status' = 'complete') THEN
            RETURN NEW;
        END IF;
        feature_name := 'personal_journal';
        operation_id := entry.id;
    ELSE
        -- The Heritage writer checkpoints Call 1, then atomically saves Call 2
        -- with its model when the same locked input revision succeeds.
        IF NEW.call2 IS NULL OR NEW."modelInfo"->>'call2Model' IS NULL
           OR (TG_OP = 'UPDATE' AND OLD.call2 IS NOT NULL AND OLD."modelInfo"->>'call2Model' IS NOT NULL) THEN
            RETURN NEW;
        END IF;
        feature_name := 'heritage_journal';
        operation_id := coalesce(entry."heritageOperationId"::text, entry.id);
    END IF;

    INSERT INTO "AnalyticsJournalCompletion" (feature, "operationId")
    VALUES (feature_name, operation_id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;

CREATE TRIGGER analytics_journal_completion AFTER INSERT OR UPDATE OF "modelInfo", call2 ON "journalEntryAI"
    FOR EACH ROW EXECUTE FUNCTION record_analytics_journal_completion();

COMMIT;
