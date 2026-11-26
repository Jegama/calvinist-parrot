import prisma from "@/lib/prisma";
import { browserGuestIdSchema } from "@/lib/mcp/ownership";

export async function transferGuestChatsToUser(guestId: string, appwriteUserId: string) {
  if (!browserGuestIdSchema.safeParse(guestId).success || !appwriteUserId || guestId === appwriteUserId) {
    return;
  }

  // Check the identity in the mutation's own snapshot. A login could have
  // started before a different request established this UUID as an account.
  await prisma.$executeRaw`
    UPDATE "chatHistory" SET "userId" = ${appwriteUserId}, "modifiedAt" = now()
    WHERE "userId" = ${guestId} AND NOT starts_with("id", 'mcp1_')
      AND NOT EXISTS (SELECT 1 FROM "McpAccountIdentity" WHERE "userId" = ${guestId})
  `;
}