// api/elaborate/route.ts

export const maxDuration = 60;

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { CORE_SYS_PROMPT, secondary_reformed_baptist, follow_up_prompt } from "@/lib/prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const main_model = "gpt-5-mini";

export async function POST(req: NextRequest) {
  const {
    question,
    categorization,
    first_answer,
    second_answer,
    third_answer,
    calvin_review,
    reviewed_answer,
    commentary,
  } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Prepare the prompt
        const prompt = follow_up_prompt
          .replace("{user_question}", question)
          .replace("{reformatted_question}", categorization.reformatted_question)
          .replace("{category}", categorization.category)
          .replace("{subcategory}", categorization.subcategory)
          .replace("{issue_type}", categorization.issue_type)
          .replace("{first_answer}", first_answer)
          .replace("{second_answer}", second_answer)
          .replace("{third_answer}", third_answer)
          .replace("{calvin_review}", calvin_review)
          .replace("{reviewed_answer}", reviewed_answer)
          .replace("{commentary}", commentary);

        // System prompt
        const coreSysPrompt = CORE_SYS_PROMPT.replace("{denomination}", secondary_reformed_baptist);

        // Call OpenAI API with streaming
        const response = await openai.chat.completions.create({
          model: main_model,
          messages: [
            { role: "system", content: coreSysPrompt },
            { role: "user", content: prompt },
          ],
          stream: true,
        });

        // Stream the response back to the client
        for await (const part of response) {
          const content = part.choices[0]?.delta?.content || "";
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "elaborated_answer", content }) + "\n")
          );
        }
      } catch (error) {
        console.error("Error:", error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
