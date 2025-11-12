-- AlterTable
ALTER TABLE "userProfile" ADD COLUMN     "churchInvolvement" TEXT,
ADD COLUMN     "coreDoctrineQuestions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "denomination" TEXT DEFAULT 'reformed-baptist',
ADD COLUMN     "followUpTendency" TEXT,
ADD COLUMN     "gospelPresentationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gospelPresentedAt" TIMESTAMP(3),
ADD COLUMN     "ministryContext" TEXT[],
ADD COLUMN     "preferredDepth" TEXT DEFAULT 'concise',
ADD COLUMN     "secondaryDoctrineQuestions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spiritualStatus" TEXT,
ADD COLUMN     "tertiaryDoctrineQuestions" INTEGER NOT NULL DEFAULT 0;
