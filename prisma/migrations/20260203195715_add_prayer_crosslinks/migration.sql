-- AlterTable
ALTER TABLE "prayerFamilyRequest" ADD COLUMN     "linkedJournalEntryId" TEXT;

-- AlterTable
ALTER TABLE "prayerPersonalRequest" ADD COLUMN     "linkedJournalEntryId" TEXT,
ADD COLUMN     "subjectMemberId" TEXT;

-- CreateIndex
CREATE INDEX "prayerFamilyRequest_linkedJournalEntryId_idx" ON "prayerFamilyRequest"("linkedJournalEntryId");

-- CreateIndex
CREATE INDEX "prayerPersonalRequest_linkedJournalEntryId_idx" ON "prayerPersonalRequest"("linkedJournalEntryId");

-- CreateIndex
CREATE INDEX "prayerPersonalRequest_subjectMemberId_idx" ON "prayerPersonalRequest"("subjectMemberId");

-- AddForeignKey
ALTER TABLE "prayerFamilyRequest" ADD CONSTRAINT "prayerFamilyRequest_linkedJournalEntryId_fkey" FOREIGN KEY ("linkedJournalEntryId") REFERENCES "journalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerPersonalRequest" ADD CONSTRAINT "prayerPersonalRequest_linkedJournalEntryId_fkey" FOREIGN KEY ("linkedJournalEntryId") REFERENCES "journalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
