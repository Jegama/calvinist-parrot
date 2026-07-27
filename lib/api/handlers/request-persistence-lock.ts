import type { Prisma } from "@prisma/client";

async function acquireAdvisoryTransactionLock(
  tx: Prisma.TransactionClient,
  lockKey: string,
) {
  // PostgreSQL advisory locks return the native void type. Execute the
  // statement without asking Prisma to deserialize a result column.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;
}

export async function acquireRequestPersistenceLock(
  tx: Prisma.TransactionClient,
  chatId: string,
  requestId: string,
) {
  const lockKey = `parrot-chat-request:${chatId}:${requestId}`;
  await acquireAdvisoryTransactionLock(tx, lockKey);
}

export async function acquireChatCreationLocks(
  tx: Prisma.TransactionClient,
  actorId: string,
  requestId: string,
  clientChatId?: string,
) {
  const lockKeys = [
    `parrot-chat-create-request:${actorId}:${requestId}`,
    ...(clientChatId
      ? [`parrot-chat-create-client-id:${clientChatId}`]
      : []),
  ].sort();

  for (const lockKey of lockKeys) {
    await acquireAdvisoryTransactionLock(tx, lockKey);
  }
}
