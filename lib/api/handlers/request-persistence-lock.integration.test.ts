import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  acquireChatCreationLocks,
  acquireRequestPersistenceLock,
} from "./request-persistence-lock";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  config();
}

const databaseUrl =
  process.env.CI
    ? process.env.DATABASE_URL
    : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
      ? process.env.TEST_DATABASE_URL
      : undefined;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("request persistence advisory lock", () => {
  let pool: Pool;
  let prisma: PrismaClient;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("acquires the PostgreSQL void-returning lock without deserializing it", async () => {
    const result = await prisma.$transaction(async (tx) => {
      await acquireRequestPersistenceLock(tx, "chat-regression", randomUUID());
      return "acquired";
    });

    expect(result).toBe("acquired");
  });

  it("serializes terminal writes for the same chat request", async () => {
    const chatId = randomUUID();
    const requestId = randomUUID();
    let releaseFirstTransaction: () => void = () => undefined;
    let announceFirstLock: () => void = () => undefined;
    const holdFirstTransaction = new Promise<void>((resolve) => {
      releaseFirstTransaction = resolve;
    });
    const firstLockAcquired = new Promise<void>((resolve) => {
      announceFirstLock = resolve;
    });
    let secondLockAcquired = false;

    const firstTransaction = prisma.$transaction(async (tx) => {
      await acquireRequestPersistenceLock(tx, chatId, requestId);
      announceFirstLock();
      await holdFirstTransaction;
    });

    let secondTransaction: Promise<void> | undefined;

    try {
      await Promise.race([
        firstLockAcquired,
        firstTransaction.then(() => {
          throw new Error(
            "The first transaction ended before acquiring the advisory lock",
          );
        }),
      ]);

      secondTransaction = prisma.$transaction(async (tx) => {
        await acquireRequestPersistenceLock(tx, chatId, requestId);
        secondLockAcquired = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(secondLockAcquired).toBe(false);
      releaseFirstTransaction();
      await Promise.all([firstTransaction, secondTransaction]);
    } finally {
      releaseFirstTransaction();
      await Promise.allSettled(
        [firstTransaction, secondTransaction].filter(
          (transaction): transaction is Promise<void> =>
            transaction !== undefined,
        ),
      );
    }

    expect(secondLockAcquired).toBe(true);
  });

  it("serializes identical chat creation retries to one persisted chat", async () => {
    const userId = `idempotency-${randomUUID()}`;
    const requestId = randomUUID();

    const createOrReplay = () =>
      prisma.$transaction(async (tx) => {
        await acquireChatCreationLocks(tx, userId, requestId);

        const existing = await tx.chatHistory.findFirst({
          where: { userId, creationRequestId: requestId },
          select: { id: true },
        });
        if (existing) {
          return existing.id;
        }

        const created = await tx.chatHistory.create({
          data: {
            userId,
            creationRequestId: requestId,
            conversationName: "New Conversation",
            category: "",
            subcategory: "",
            issue_type: "",
          },
        });
        await tx.chatMessage.create({
          data: {
            chatId: created.id,
            requestId,
            sender: "user",
            content: "What is grace?",
          },
        });
        return created.id;
      });

    try {
      const [firstChatId, retriedChatId] = await Promise.all([
        createOrReplay(),
        createOrReplay(),
      ]);

      expect(retriedChatId).toBe(firstChatId);
      await expect(
        prisma.chatHistory.count({
          where: { userId, creationRequestId: requestId },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.chatMessage.count({
          where: { chatId: firstChatId, requestId, sender: "user" },
        }),
      ).resolves.toBe(1);
    } finally {
      const createdChats = await prisma.chatHistory.findMany({
        where: { userId },
        select: { id: true },
      });
      await prisma.chatMessage.deleteMany({
        where: { chatId: { in: createdChats.map((chat) => chat.id) } },
      });
      await prisma.chatHistory.deleteMany({ where: { userId } });
    }
  });
});
