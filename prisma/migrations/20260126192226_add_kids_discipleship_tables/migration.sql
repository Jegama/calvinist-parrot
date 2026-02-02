/*
  Warnings:

  - The values [SPIRIT,FLESH] on the enum `LogCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "CompetencyType" AS ENUM ('PROFESSIONAL', 'PERSONAL');

-- AlterEnum
BEGIN;
CREATE TYPE "LogCategory_new" AS ENUM ('NURTURE', 'ADMONITION');
ALTER TABLE "journalEntry" ALTER COLUMN "category" TYPE "LogCategory_new" USING ("category"::text::"LogCategory_new");
ALTER TYPE "LogCategory" RENAME TO "LogCategory_old";
ALTER TYPE "LogCategory_new" RENAME TO "LogCategory";
DROP TYPE "public"."LogCategory_old";
COMMIT;

-- CreateTable
CREATE TABLE "discipleshipAnnualPlan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "characterGoal" TEXT NOT NULL,
    "characterScripture" TEXT,
    "characterAction" TEXT,
    "competencyGoal" TEXT NOT NULL,
    "competencyScripture" TEXT,
    "competencyAction" TEXT,
    "competencyType" "CompetencyType" NOT NULL DEFAULT 'PERSONAL',
    "blessingsPlan" TEXT,
    "consequencesPlan" TEXT,
    "themeVerse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipleshipAnnualPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipleshipMonthlyVision" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "memoryVerse" TEXT,
    "characterFocus" TEXT,
    "competencyFocus" TEXT,
    "emphasize" TEXT,
    "watchFor" TEXT,
    "encourage" TEXT,
    "correct" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipleshipMonthlyVision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discipleshipAnnualPlan_memberId_idx" ON "discipleshipAnnualPlan"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "discipleshipAnnualPlan_memberId_year_key" ON "discipleshipAnnualPlan"("memberId", "year");

-- CreateIndex
CREATE INDEX "discipleshipMonthlyVision_memberId_idx" ON "discipleshipMonthlyVision"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "discipleshipMonthlyVision_memberId_yearMonth_key" ON "discipleshipMonthlyVision"("memberId", "yearMonth");

-- AddForeignKey
ALTER TABLE "discipleshipAnnualPlan" ADD CONSTRAINT "discipleshipAnnualPlan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "prayerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleshipMonthlyVision" ADD CONSTRAINT "discipleshipMonthlyVision_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "prayerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
