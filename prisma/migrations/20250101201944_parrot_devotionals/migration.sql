/*
  Warnings:

  - You are about to drop the `parrotApiKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "parrotApiKey";

-- CreateTable
CREATE TABLE "parrotDevotionals" (
    "id" TEXT NOT NULL,
    "devotional_id" TEXT NOT NULL,
    "bible_verse" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "devotional_text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parrotDevotionals_pkey" PRIMARY KEY ("id")
);
