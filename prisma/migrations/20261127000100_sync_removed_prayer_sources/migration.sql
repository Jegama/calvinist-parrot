-- Both request foreign keys clear the source link after a journal entry is deleted.
-- Capture its households before those links disappear, including links across households.
CREATE FUNCTION bump_prayer_versions_before_source_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "prayerFamilySpace"
  SET version = version + 1
  WHERE id IN (
    SELECT "spaceId"
    FROM "prayerPersonalRequest"
    WHERE "linkedJournalEntryId" = OLD.id
    UNION
    SELECT family."spaceId"
    FROM "prayerFamilyRequest" AS request
    JOIN "prayerFamily" AS family ON family.id = request."familyId"
    WHERE request."linkedJournalEntryId" = OLD.id
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER bump_prayer_versions_before_source_delete
BEFORE DELETE ON "journalEntry"
FOR EACH ROW EXECUTE FUNCTION bump_prayer_versions_before_source_delete();
