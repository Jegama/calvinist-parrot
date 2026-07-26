// utils/generateConversationName.ts

import { parrotAI } from '@/lib/parrot-ai';
import {
    CATEGORIZING_SYS_PROMPT,
    n_shot_examples,
  } from '@/lib/prompts/parrot-qa';
import type { ChatMessage } from '@/lib/parrot-ai';
import {
  deterministicConversationTitle,
  MAX_CONVERSATION_TITLE_LENGTH,
} from '@/lib/chat-title';

const MAX_NAME_ATTEMPTS = 2;

function normalizeGeneratedTitle(value: string) {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONVERSATION_TITLE_LENGTH);
}

// Helper: generate a conversation name with bounded retries and a deterministic fallback.
export async function generateConversationName(currentConversation: string): Promise<string> {
  const promptCreateName = `I have this conversation:

---------------------
${currentConversation}
---------------------

What would you like to name this conversation? It can be a short name to remember this conversation.

**Note:** The output should strictly adhere to the predefined JSON schema.`;

  const conversationNameSchema = {
    name: "conversation_name_schema",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  };

  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    try {
      const result = await parrotAI.generateStructured<{ name: string }>({
        messages: [
          { role: "system", content: 'You are a helpful assistant that can create short names for conversations.' },
          { role: "user", content: promptCreateName },
        ],
        schema: conversationNameSchema,
      });
      const title = normalizeGeneratedTitle(result.data.name);
      if (title) return title;
    } catch (error) {
      if (attempt === MAX_NAME_ATTEMPTS - 1) {
        console.error("Conversation naming failed after bounded retries:", error);
      }
    }
  }

  return deterministicConversationTitle(currentConversation);
}

// Build categorization messages
export function buildCategorizationMessages(userMessage: string): ChatMessage[] {
  return [
    { role: 'system', content: CATEGORIZING_SYS_PROMPT },
    ...n_shot_examples.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content as string,
    })),
    { role: 'user', content: userMessage },
  ];
}
