// utils/generateConversationName.ts

import { parrotAI } from '@/lib/parrot-ai';
import {
    CATEGORIZING_SYS_PROMPT,
    n_shot_examples,
  } from '@/lib/prompts/parrot-qa';
import type { ChatMessage } from '@/lib/parrot-ai';

// Helper: generate conversation name
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

  try {
    const result = await parrotAI.generateStructured<{ name: string }>({
      messages: [
        { role: "system", content: 'You are a helpful assistant that can create short names for conversations.' },
        { role: "user", content: promptCreateName },
      ],
      schema: conversationNameSchema,
    });

    return result.data.name;
  } catch {
    return await generateConversationName(currentConversation);
  }
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
