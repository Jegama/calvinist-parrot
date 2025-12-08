-- AlterTable
ALTER TABLE "prayerMember" ADD COLUMN     "assignmentCapacity" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "assignmentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isChild" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "appwriteUserId" DROP NOT NULL;
