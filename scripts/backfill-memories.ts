// scripts/backfill-memories.ts
// Backfill memory extraction for historical conversations
// Run with: npx tsx scripts/backfill-memories.ts [--user-id=<id>] [--limit=<n>] [--dry-run]

import prisma from "@/lib/prisma";
import { updateUserMemoriesFromConversation } from "@/utils/memoryExtraction";

interface BackfillOptions {
  userId?: string;
  limit?: number;
  dryRun?: boolean;
  minMessages?: number;
}

async function backfillMemories(options: BackfillOptions = {}) {
  const {
    userId,
    limit = 100,
    dryRun = false,
    minMessages = 2, // Only process conversations with at least this many messages
  } = options;

  console.log("🔄 Starting memory backfill...");
  console.log(`Options: ${JSON.stringify(options, null, 2)}\n`);

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No memories will be saved\n");
  }

  try {
    // Step 1: Find conversations to process
    const whereClause: any = {
      // Only process conversations with multiple messages
      messages: {
        some: {},
      },
    };

    if (userId) {
      whereClause.userId = userId;
      console.log(`📌 Filtering for user: ${userId}\n`);
    }

    const conversations = await prisma.chatHistory.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          select: {
            sender: true,
            content: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    console.log(`📊 Found ${conversations.length} conversations to process\n`);

    if (conversations.length === 0) {
      console.log("✅ No conversations found. Nothing to backfill.");
      return;
    }

    // Step 2: Process each conversation
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const chat of conversations) {
      const { id, userId: chatUserId, messages, conversationName, category, subcategory, denomination } = chat;

      // Skip conversations without enough messages
      if (messages.length < minMessages) {
        console.log(`⏭️  Skipping chat ${id} (${conversationName}) - only ${messages.length} message(s)`);
        skipped++;
        continue;
      }

      console.log(`\n🔄 Processing chat ${id}:`);
      console.log(`   Name: ${conversationName}`);
      console.log(`   User: ${chatUserId}`);
      console.log(`   Messages: ${messages.length}`);
      console.log(`   Category: ${category || 'none'}`);

      if (dryRun) {
        console.log(`   ✅ Would process (dry run)`);
        processed++;
        continue;
      }

      try {
        // Extract memories from this conversation
        await updateUserMemoriesFromConversation(
          chatUserId,
          messages.map(m => ({ sender: m.sender, content: m.content })),
          {
            category: category || undefined,
            subcategory: subcategory || undefined,
            denomination: denomination || undefined,
          }
        );

        console.log(`   ✅ Successfully extracted memories`);
        processed++;

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`   ❌ Error processing chat ${id}:`, error);
        errors++;
      }
    }

    // Step 3: Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 Backfill Summary:");
    console.log(`   Total found: ${conversations.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log("=".repeat(50));

    if (!dryRun && processed > 0) {
      console.log("\n💡 Tip: View extracted memories with:");
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
    if (arg.startsWith('--user-id=')) {
      options.userId = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--min-messages=')) {
      options.minMessages = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Memory Backfill Script
======================

Usage:
  npx tsx scripts/backfill-memories.ts [options]

Options:
  --user-id=<id>        Only process conversations for this user
  --limit=<n>           Maximum number of conversations to process (default: 100)
  --min-messages=<n>    Only process conversations with at least N messages (default: 2)
  --dry-run             Show what would be processed without saving
  --help, -h            Show this help message

Examples:
  # Process last 100 conversations (dry run first)
  npx tsx scripts/backfill-memories.ts --dry-run

  # Process all conversations for a specific user
  npx tsx scripts/backfill-memories.ts --user-id=6754db6b00119ba9e0da

  # Process last 50 conversations with at least 4 messages
  npx tsx scripts/backfill-memories.ts --limit=50 --min-messages=4

  # Full backfill (be careful with rate limits!)
  npx tsx scripts/backfill-memories.ts --limit=1000

Notes:
  - This script uses OpenAI API (GPT-4o-mini) - costs apply
  - Rate limited to 2 requests/second to avoid API limits
  - Memory extraction is idempotent (safe to run multiple times)
  - Use --dry-run first to see what will be processed
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
