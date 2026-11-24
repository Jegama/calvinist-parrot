// langChainAgents/tools/studyBibleMcpTools.ts

import { MCPAdapter } from "@langchain/mcp-adapters";

const STUDY_BIBLE_MCP_URL = process.env.STUDY_BIBLE_MCP_URL;

/**
 * Loads Study Bible MCP tools from the remote HTTP server.
 * Returns an empty array if STUDY_BIBLE_MCP_URL is not configured.
 */
export async function getStudyBibleTools() {
  if (!STUDY_BIBLE_MCP_URL) {
    console.log("STUDY_BIBLE_MCP_URL not configured, skipping Study Bible MCP tools");
    return [];
  }

  try {
    const client = new MCPAdapter({
      // The chat prompt and progress labels use the server's original tool names.
      prefixToolNameWithServerName: false,
      servers: {
        studyBible: {
          transport: "sse",
          url: STUDY_BIBLE_MCP_URL,
        },
      },
    });

    const tools = await client.listTools();
    console.log(`Loaded ${tools.length} Study Bible MCP tools`);
    return tools;
  } catch (error) {
    console.error("Failed to load Study Bible MCP tools:", error);
    return [];
  }
}
