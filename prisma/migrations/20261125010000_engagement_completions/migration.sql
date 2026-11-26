BEGIN;

-- Reuse the completion contract from #97. PostgreSQL fires AFTER triggers in name
-- order: analytics_journal_completion writes the receipt before this trigger runs.
-- A Heritage revision has its own provider operation but belongs to one saved entry.
CREATE FUNCTION record_engagement_journal_ready() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "AnalyticsEngagementEvent" (feature, step, channel, "flowId", "occurredAt")
    SELECT saved.feature, 'reflection_ready', saved.channel, entry.id, completed."completedAt"
    FROM "journalEntry" entry
    JOIN "AnalyticsJournalCompletion" completed
      ON completed.feature = CASE entry."entryType" WHEN 'PERSONAL' THEN 'personal_journal' ELSE 'heritage_journal' END
     AND completed."operationId" = coalesce(entry."heritageOperationId"::text, entry.id)
    JOIN "AnalyticsEngagementEvent" saved
      ON saved.feature = completed.feature AND saved.step = 'saved' AND saved.channel = 'web' AND saved."flowId" = entry.id
    WHERE entry.id = NEW."entryId"
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;
CREATE TRIGGER engagement_journal_ready AFTER INSERT OR UPDATE OF "modelInfo", call2 ON "journalEntryAI"
    FOR EACH ROW EXECUTE FUNCTION record_engagement_journal_ready();

-- The worker may finish without anyone visiting the detail page. Inherit the
-- submitting entry point and leave evaluations with no attributed start alone.
CREATE FUNCTION record_engagement_sermon_ready() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "AnalyticsEngagementEvent" (feature, step, channel, "flowId")
    SELECT feature, 'report_ready', channel, "flowId" FROM "AnalyticsEngagementEvent"
    WHERE feature = 'sermon' AND step = 'submitted' AND channel IN ('web', 'public_api') AND "flowId" = NEW.id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;
CREATE TRIGGER engagement_sermon_ready AFTER UPDATE OF status ON "sermonEvaluation"
    FOR EACH ROW WHEN (NEW.status IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION record_engagement_sermon_ready();

COMMIT;
