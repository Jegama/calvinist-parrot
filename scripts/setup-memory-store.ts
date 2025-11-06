// scripts/setup-memory-store.ts
// Run this script once to initialize the LangGraph memory store tables

import { setupMemoryStore } from "@/lib/langGraphStore";

async function main() {
  console.log("🚀 Setting up LangGraph memory store...");
  
  try {
    await setupMemoryStore();
    console.log("✅ Memory store setup complete!");
    console.log("📝 The following tables have been created in your PostgreSQL database:");
    console.log("   - store (for long-term memories)");
    console.log("   - Additional indices for semantic search (if configured)");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting up memory store:", error);
    process.exit(1);
  }
}

main();
