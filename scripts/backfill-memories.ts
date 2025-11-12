// scripts/backfill-memories.ts
// Backfill memory extraction for historical conversations
// Run with: npx tsx scripts/backfill-memories.ts [--user-id=<id>] [--process-all] [--batch-size=<n>] [--min-messages=<n>] [--oldest=<n>] [--dry-run]

import prisma from "@/lib/prisma";
import { updateUserMemoriesFromConversation } from "@/utils/memoryExtraction";

interface BackfillOptions {
  userId?: string;
  processAll?: boolean;
  batchSize?: number;
  dryRun?: boolean;
  minMessages?: number;
  oldest?: number; // Limit to the first N oldest conversations per user
}

interface UserStats {
  userId: string;
  totalConversations: number;
  processed: number;
  skipped: number;
  errors: number;
}

/**
 * Get all unique users with their conversation counts
 */
async function getUserConversationCounts(): Promise<
  Array<{ userId: string; count: number }>
> {
  const users = await prisma.chatHistory.groupBy({
    by: ["userId"],
    _count: {
      id: true,
    },
    where: {
      messages: {
        some: {},
      },
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
  });

  return users.map((u) => ({ userId: u.userId, count: u._count.id }));
}

/**
 * Process conversations for a single user with pagination
 */
async function processUserConversations(
  userId: string,
  options: {
    minMessages: number;
    dryRun: boolean;
    batchSize: number;
    oldest?: number;
  }
): Promise<UserStats> {
  const stats: UserStats = {
    userId,
    totalConversations: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
  };

  let skip = 0;
  let hasMore = true;
  let considered = 0; // how many oldest conversations we've considered for this user

  while (hasMore) {
    const conversations = await prisma.chatHistory.findMany({
      where: {
        userId,
        messages: { some: {} },
      },
      include: {
        messages: {
          orderBy: { timestamp: "asc" },
          select: { sender: true, content: true },
        },
      },
      // Process oldest first for chronological memory building
      orderBy: { createdAt: "asc" },
      skip,
      take: options.batchSize,
    });

    if (conversations.length === 0) {
      hasMore = false;
      break;
    }

    stats.totalConversations += conversations.length;

    let reachedOldestLimit = false;
    for (const chat of conversations) {
      // If an oldest limit is provided, stop once we have considered N conversations
      if (
        typeof options.oldest === "number" &&
        options.oldest > 0 &&
        considered >= options.oldest
      ) {
        reachedOldestLimit = true;
        break;
      }

      considered += 1;
      const { messages, conversationName } = chat;

      // Skip conversations without enough messages
      if (messages.length < options.minMessages) {
        console.log(
          `   ⏭️  Skipping "${conversationName}" - only ${messages.length} message(s)`
        );
        stats.skipped++;
        continue;
      }

      console.log(
        `   🔄 Processing "${conversationName}" (${messages.length} messages)`
      );

      if (options.dryRun) {
        console.log(`      ✅ Would process (dry run)`);
        stats.processed++;
        continue;
      }

      try {
        await updateUserMemoriesFromConversation(
          userId,
          messages.map((m) => ({ sender: m.sender, content: m.content }))
        );

        console.log(`      ✅ Memories extracted`);
        stats.processed++;

        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`      ❌ Error:`, error);
        stats.errors++;
      }
    }

    skip += options.batchSize;

    // If we got fewer than batchSize, we're done
    if (conversations.length < options.batchSize || reachedOldestLimit) {
      hasMore = false;
    }
  }

  return stats;
}

async function backfillMemories(options: BackfillOptions = {}) {
  const {
    userId,
    processAll = false,
    batchSize = 50,
    dryRun = false,
    minMessages = 2,
    oldest,
  } = options;

  console.log("🔄 Starting memory backfill...");
  console.log(`Options: ${JSON.stringify(options, null, 2)}\n`);

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No memories will be saved\n");
  }

  try {
    // Step 1: Get user list
    let usersToProcess: Array<{ userId: string; count: number }>;

    if (userId) {
      // Single user mode
      const count = await prisma.chatHistory.count({
        where: {
          userId,
          messages: { some: {} },
        },
      });
      usersToProcess = [{ userId, count }];
      console.log(`📌 Processing single user: ${userId}`);
      console.log(`   Total conversations: ${count}\n`);
    } else if (processAll) {
      // Process all users
      console.log("📊 Fetching all users with conversations...\n");
      const allUsers = await getUserConversationCounts();

      // Filter out users with only 1 conversation (likely anonymous/one-time users)
      usersToProcess = allUsers.filter((u) => u.count > 1);
      const skippedUsers = allUsers.length - usersToProcess.length;

      console.log(`📌 Found ${allUsers.length} total users`);
      console.log(
        `   Skipping ${skippedUsers} users with only 1 conversation (anonymous/one-time users)`
      );
      console.log(
        `   Processing ${usersToProcess.length} users with 2+ conversations:\n`
      );

      usersToProcess.forEach((u, i) => {
        console.log(`   ${i + 1}. User ${u.userId}: ${u.count} conversations`);
      });
      console.log();
    } else {
      console.error(
        "❌ Error: Must specify either --user-id=<id> or --process-all"
      );
      console.log("Run with --help for usage information");
      process.exit(1);
    }

    if (usersToProcess.length === 0) {
      console.log("✅ No users found with conversations. Nothing to backfill.");
      return;
    }

    // Step 2: Process each user
    const allStats: UserStats[] = [];
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < usersToProcess.length; i++) {
      const { userId: currentUserId, count } = usersToProcess[i];

      console.log("\n" + "─".repeat(50));
      console.log(
        `👤 Processing user ${i + 1}/${usersToProcess.length}: ${currentUserId}`
      );
      console.log(`   Total conversations: ${count}`);
      console.log("─".repeat(50));

      const stats = await processUserConversations(currentUserId, {
        minMessages,
        dryRun,
        batchSize,
        oldest,
      });

      allStats.push(stats);
      totalProcessed += stats.processed;
      totalSkipped += stats.skipped;
      totalErrors += stats.errors;

      console.log(
        `\n   ✅ User complete: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`
      );

      // Pause between users to avoid rate limits
      if (i < usersToProcess.length - 1) {
        console.log("   ⏸️  Pausing 2s before next user...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Step 3: Final Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 FINAL BACKFILL SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total users processed: ${usersToProcess.length}`);
    console.log(`Total conversations processed: ${totalProcessed}`);
    console.log(`Total skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log("\nPer-user breakdown:");
    allStats.forEach((stat, i) => {
      console.log(`  ${i + 1}. ${stat.userId}:`);
      console.log(
        `     Processed: ${stat.processed}, Skipped: ${stat.skipped}, Errors: ${stat.errors}`
      );
    });
    console.log("=".repeat(50));

    if (!dryRun && totalProcessed > 0) {
      console.log("\n💡 View extracted memories at:");
      console.log(`   http://localhost:3000/api/user-memory?userId=<USER_ID>`);
    }
  } catch (error) {
    console.error("❌ Fatal error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--user-id=")) {
      options.userId = arg.split("=")[1];
    } else if (arg === "--process-all") {
      options.processAll = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--min-messages=")) {
      options.minMessages = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--oldest=")) {
      options.oldest = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Memory Backfill Script
======================

Usage:
  npx tsx scripts/backfill-memories.ts [options]

Options:
  --user-id=<id>        Process conversations for this specific user only
  --process-all         Process ALL users and their conversations (use with caution!)
  --batch-size=<n>      Number of conversations to process per user batch (default: 50)
  --min-messages=<n>    Only process conversations with at least N messages (default: 2)
  --oldest=<n>          Process only the first N oldest conversations per user (e.g., --oldest=10)
  --dry-run             Show what would be processed without saving
  --help, -h            Show this help message

Examples:
  # See what would be processed (recommended first step)
  npx tsx scripts/backfill-memories.ts --process-all --dry-run

  # Process all conversations for a specific user
  npx tsx scripts/backfill-memories.ts --user-id=abcd1234efgh5678ijkl90mn

  # Process all users with custom batch size
  npx tsx scripts/backfill-memories.ts --process-all --batch-size=25

  # Process all users with at least 4 messages per conversation
  npx tsx scripts/backfill-memories.ts --process-all --min-messages=4

  # Full production backfill (after dry-run!)
  npx tsx scripts/backfill-memories.ts --process-all

How it works:
  1. Fetches all unique users with conversation counts
  2. Processes each user's conversations in batches
  3. Shows per-user statistics and progress
  4. Pauses between users to avoid rate limits

Notes:
  - This script uses OpenAI API (GPT-4.1-mini) - costs apply
  - Rate limited: 500ms between conversations, 2s between users
  - Memory extraction is idempotent (safe to run multiple times)
  - Use --dry-run first to see what will be processed
  - Progress is logged per-user for better visibility
      `);
      process.exit(0);
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await backfillMemories(options);
  process.exit(0);
}

main();
