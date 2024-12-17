/*
  Warnings:

  - You are about to drop the `ChatHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_chatId_fkey";

-- DropTable
DROP TABLE "ChatHistory";

-- DropTable
DROP TABLE "Message";

-- CreateTable
CREATE TABLE "chatHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "chatMessage" ADD CONSTRAINT "chatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chatHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
