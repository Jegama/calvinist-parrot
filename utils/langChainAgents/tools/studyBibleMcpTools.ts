// langChainAgents/tools/studyBibleMcpTools.ts

import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const STUDY_BIBLE_MCP_URL = process.env.STUDY_BIBLE_MCP_URL;

/**
 * Loads Study Bible MCP tools from the remote HTTP server.
 * Returns an empty array if STUDY_BIBLE_MCP_URL is not configured.
 *
 * Uses MultiServerMCPClient which is stateless by default:
 * each tool invocation creates a fresh session, executes, and cleans up.
 * This is ideal for serverless environments (Vercel).
 */
export async function getStudyBibleTools() {
  if (!STUDY_BIBLE_MCP_URL) {
    console.log("STUDY_BIBLE_MCP_URL not configured, skipping Study Bible MCP tools");
    return [];
  }

  try {
    const client = new MultiServerMCPClient({
      studyBible: {
        transport: "sse",
        url: STUDY_BIBLE_MCP_URL,
      },
    });

    const tools = await client.getTools();
    console.log(`Loaded ${tools.length} Study Bible MCP tools`);
    return tools;
  } catch (error) {
    console.error("Failed to load Study Bible MCP tools:", error);
    return [];
  }
}
