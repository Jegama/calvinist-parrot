ALTER TABLE "chatHistory"
ADD COLUMN "creationRequestId" TEXT;

CREATE UNIQUE INDEX "chatHistory_userId_creationRequestId_key"
ON "chatHistory"("userId", "creationRequestId");
