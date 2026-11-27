-- Use the same lock order as a prayer edit: unlink requests first, then bump their households.
CREATE FUNCTION unlink_prayer_journal_sources(source_ids text[], deleting_space_id text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  affected_space_id text;
BEGIN
  FOR affected_space_id IN
    WITH family_links AS (
      UPDATE "prayerFamilyRequest" AS request
      SET "linkedJournalEntryId" = NULL
      FROM "prayerFamily" AS family
      WHERE request."linkedJournalEntryId" = ANY(source_ids) AND family.id = request."familyId"
      RETURNING family."spaceId"
    ), personal_links AS (
      UPDATE "prayerPersonalRequest"
      SET "linkedJournalEntryId" = NULL
      WHERE "linkedJournalEntryId" = ANY(source_ids)
      RETURNING "spaceId"
    )
    SELECT "spaceId" FROM family_links
    UNION
    SELECT "spaceId" FROM personal_links
    ORDER BY "spaceId"
  LOOP
    UPDATE "prayerFamilySpace" SET version = version + 1
    WHERE id = affected_space_id AND id IS DISTINCT FROM deleting_space_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION bump_prayer_versions_before_source_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM unlink_prayer_journal_sources(ARRAY[OLD.id]);
  RETURN OLD;
END;
$$;
