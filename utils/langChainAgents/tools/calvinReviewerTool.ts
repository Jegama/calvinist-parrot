// langChainAgents/tools/calvinReviewerTool.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import OpenAI from "openai";
import { CALVIN_SYS_PROMPT_REVIEWER } from "@/lib/prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const mini_model = "gpt-4o-mini";

async function calvinReview(input: { draft: string }): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: CALVIN_SYS_PROMPT_REVIEWER },
    { role: "user", content: input.draft },
  ];
  try {
    const reviewResponse = await openai.chat.completions.create({
      model: mini_model,
      messages,
      temperature: 0,
    });
    return reviewResponse.choices[0]?.message?.content || "";
  } catch (error) {
    return `Error: ${error}`;
  }
}

export const calvinReviewerTool = tool(
  calvinReview,
  {
    name: "CalvinReviewer",
    description: "Given a draft answer, returns feedback from Calvin the Reviewer.",
    schema: z.object({
      draft: z.string().describe("The draft answer to review."),
    }),
  }
);