-- Associate every message artifact with the request that produced it.
ALTER TABLE "chatMessage" ADD COLUMN "requestId" TEXT;

CREATE INDEX "chatMessage_chatId_requestId_idx"
ON "chatMessage"("chatId", "requestId");
