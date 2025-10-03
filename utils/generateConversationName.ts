// utils/generateConversationName.ts

import OpenAI from 'openai';
import {
    CATEGORIZING_SYS_PROMPT,
    n_shot_examples,
  } from '@/lib/prompts';

// Helper: generate conversation name
export async function generateConversationName(currentConversation: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const promptCreateName = `I have this conversation:

---------------------
${currentConversation}
---------------------

What would you like to name this conversation? It can be a short name to remember this conversation.

**Note:** The output should strictly adhere to the predefined JSON schema.`;

  const getNamePrompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: 'You are a helpful assistant that can create short names for conversations.' },
    { role: "user", content: promptCreateName },
  ];

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

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: getNamePrompt,
    response_format: {
      type: "json_schema",
      json_schema: conversationNameSchema,
    },
  });

  const conversationNameContent = response.choices[0].message.content;

  if (conversationNameContent) {
    try {
      const conversationName = JSON.parse(conversationNameContent).name;
      return conversationName;
    } catch (error) {
      return await generateConversationName(currentConversation);
    }
  } else {
    return await generateConversationName(currentConversation);
  }
}

// Build categorization messages
export function buildCategorizationMessages(userMessage: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: CATEGORIZING_SYS_PROMPT },
    ...n_shot_examples,
    { role: 'user', content: userMessage },
  ];
}
