-- CreateEnum
CREATE TYPE "CoreDoctrineStatus" AS ENUM ('TRUE', 'FALSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChurchEvaluationStatus" AS ENUM ('RECOMMENDED', 'BIBLICALLY_SOUND_WITH_DIFFERENCES', 'LIMITED_INFORMATION', 'NOT_ENDORSED');

-- CreateTable
CREATE TABLE "church" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "denominationLabel" TEXT,
    "denominationConfidence" DOUBLE PRECISION,
    "denominationSignals" TEXT[],
    "confessionAdopted" BOOLEAN NOT NULL DEFAULT false,
    "confessionName" TEXT,
    "confessionSourceUrl" TEXT,
    "bestBeliefsUrl" TEXT,
    "bestConfessionUrl" TEXT,
    "bestAboutUrl" TEXT,
    "bestLeadershipUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "churchAddress" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "sourceUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "churchAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "churchServiceTime" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "churchServiceTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "churchEvaluation" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "rawEvaluation" JSONB NOT NULL,
    "badges" TEXT[],
    "secondary" JSONB,
    "tertiary" JSONB,
    "coreOnSiteCount" INTEGER NOT NULL,
    "coreTotalCount" INTEGER NOT NULL,
    "coverageRatio" DOUBLE PRECISION NOT NULL,
    "status" "ChurchEvaluationStatus" NOT NULL,
    "coreTrinity" "CoreDoctrineStatus" NOT NULL,
    "coreGospel" "CoreDoctrineStatus" NOT NULL,
    "coreJustificationByFaith" "CoreDoctrineStatus" NOT NULL,
    "coreChristDeityHumanity" "CoreDoctrineStatus" NOT NULL,
    "coreScriptureAuthority" "CoreDoctrineStatus" NOT NULL,
    "coreIncarnationVirginBirth" "CoreDoctrineStatus" NOT NULL,
    "coreAtonementNecessary" "CoreDoctrineStatus" NOT NULL,
    "coreResurrectionOfJesus" "CoreDoctrineStatus" NOT NULL,
    "coreReturnAndJudgment" "CoreDoctrineStatus" NOT NULL,
    "coreCharacterOfGod" "CoreDoctrineStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "churchEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "church_website_key" ON "church"("website");

-- AddForeignKey
ALTER TABLE "churchAddress" ADD CONSTRAINT "churchAddress_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "churchServiceTime" ADD CONSTRAINT "churchServiceTime_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "churchEvaluation" ADD CONSTRAINT "churchEvaluation_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
