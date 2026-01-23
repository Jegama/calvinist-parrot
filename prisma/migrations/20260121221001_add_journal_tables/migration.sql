-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('PERSONAL', 'DISCIPLESHIP');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('SPIRIT', 'FLESH');

-- CreateTable
CREATE TABLE "journalEntry" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT,
    "authorProfileId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryText" TEXT NOT NULL,
    "entryType" "JournalEntryType" NOT NULL DEFAULT 'PERSONAL',
    "category" "LogCategory",
    "subjectMemberId" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journalEntryAI" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "call1" JSONB NOT NULL,
    "call2" JSONB,
    "modelInfo" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journalEntryAI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journalEntry_spaceId_idx" ON "journalEntry"("spaceId");

-- CreateIndex
CREATE INDEX "journalEntry_authorProfileId_idx" ON "journalEntry"("authorProfileId");

-- CreateIndex
CREATE INDEX "journalEntry_subjectMemberId_idx" ON "journalEntry"("subjectMemberId");

-- CreateIndex
CREATE INDEX "journalEntry_entryType_idx" ON "journalEntry"("entryType");

-- CreateIndex
CREATE UNIQUE INDEX "journalEntryAI_entryId_key" ON "journalEntryAI"("entryId");

-- AddForeignKey
ALTER TABLE "journalEntry" ADD CONSTRAINT "journalEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journalEntryAI" ADD CONSTRAINT "journalEntryAI_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
