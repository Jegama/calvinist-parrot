import type { Prisma } from "@prisma/client";

export async function acquireRequestPersistenceLock(
  tx: Prisma.TransactionClient,
  chatId: string,
  requestId: string,
) {
  const lockKey = `parrot-chat-request:${chatId}:${requestId}`;

  // This function returns PostgreSQL's native void type. Execute it without
  // asking Prisma to deserialize a result column.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;
}
