ALTER TABLE "prayerFamilySpace" ADD COLUMN "version" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX "prayerMember_appwriteUserId_idx" ON "prayerMember"("appwriteUserId");
