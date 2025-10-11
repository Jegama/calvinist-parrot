-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('ACTIVE', 'ANSWERED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "userProfile" (
    "id" TEXT NOT NULL,
    "appwriteUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "defaultSpaceId" TEXT,
    "answeredPersonalCount" INTEGER NOT NULL DEFAULT 0,
    "answeredFamilyCount" INTEGER NOT NULL DEFAULT 0,
    "journalEntriesCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrayerAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerFamilySpace" (
    "id" TEXT NOT NULL,
    "spaceName" TEXT NOT NULL,
    "shareCode" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prayerFamilySpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "appwriteUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerFamily" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "parents" TEXT NOT NULL,
    "children" TEXT[],
    "categoryTag" TEXT,
    "lastPrayedAt" TIMESTAMP(3),
    "lastPrayedByMemberId" TEXT,
    "journalNotes" TEXT,
    "linkedScripture" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prayerFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerFamilyRequest" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestText" TEXT NOT NULL,
    "notes" TEXT,
    "linkedScripture" TEXT,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUpdated" TIMESTAMP(3) NOT NULL,
    "lastPrayedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "prayerFamilyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerPersonalRequest" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestText" TEXT NOT NULL,
    "notes" TEXT,
    "linkedScripture" TEXT,
    "requesterMemberId" TEXT,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUpdated" TIMESTAMP(3) NOT NULL,
    "lastPrayedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "prayerPersonalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayerJournalEntry" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryText" TEXT NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "prayerJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userProfile_appwriteUserId_key" ON "userProfile"("appwriteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "prayerFamilySpace_shareCode_key" ON "prayerFamilySpace"("shareCode");

-- AddForeignKey
ALTER TABLE "userProfile" ADD CONSTRAINT "userProfile_defaultSpaceId_fkey" FOREIGN KEY ("defaultSpaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerMember" ADD CONSTRAINT "prayerMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerFamily" ADD CONSTRAINT "prayerFamily_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerFamily" ADD CONSTRAINT "prayerFamily_lastPrayedByMemberId_fkey" FOREIGN KEY ("lastPrayedByMemberId") REFERENCES "prayerMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerFamilyRequest" ADD CONSTRAINT "prayerFamilyRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "prayerFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerPersonalRequest" ADD CONSTRAINT "prayerPersonalRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayerJournalEntry" ADD CONSTRAINT "prayerJournalEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "prayerFamilySpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
