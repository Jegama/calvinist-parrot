-- CreateTable
CREATE TABLE "parrotApiKey" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "parrotApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parrotApiKey_apiKey_key" ON "parrotApiKey"("apiKey");
