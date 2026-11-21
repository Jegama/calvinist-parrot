import type { LogCategory, Prisma } from "@prisma/client";

// Edits and stage writes take the parent lock first, even before an AI row exists.
export async function lockKidsLog(tx: Prisma.TransactionClient, id: string) {
  const [log] = await tx.$queryRaw<Array<{
    entryText: string;
    category: LogCategory | null;
    heritageOperationId: string | null;
  }>>`
    SELECT "entryText", category, "heritageOperationId"
    FROM "journalEntry" WHERE id = ${id} AND "entryType" = 'DISCIPLESHIP' FOR UPDATE
  `;
  return log;
}
