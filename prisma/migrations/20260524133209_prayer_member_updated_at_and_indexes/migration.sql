-- AlterTable: add updatedAt nullable, backfill from joinedAt, then enforce NOT NULL
ALTER TABLE "prayerMember" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "prayerMember" SET "updatedAt" = COALESCE("joinedAt", CURRENT_TIMESTAMP) WHERE "updatedAt" IS NULL;
ALTER TABLE "prayerMember" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "prayerFamily_spaceId_idx" ON "prayerFamily"("spaceId");

-- CreateIndex
CREATE INDEX "prayerFamilyRequest_familyId_idx" ON "prayerFamilyRequest"("familyId");

-- CreateIndex
CREATE INDEX "prayerMember_spaceId_idx" ON "prayerMember"("spaceId");

-- CreateIndex
CREATE INDEX "prayerPersonalRequest_spaceId_idx" ON "prayerPersonalRequest"("spaceId");
