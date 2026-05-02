import prisma from "@/lib/prisma";

export async function transferGuestChatsToUser(guestId: string, appwriteUserId: string) {
  if (!guestId || !appwriteUserId || guestId === appwriteUserId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.chatHistory.updateMany({
      where: { userId: guestId },
      data: { userId: appwriteUserId },
    });
  });
}