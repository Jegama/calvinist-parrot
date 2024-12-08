// api/parrot_main/route.ts

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { CORE_SYS_PROMPT } from "@/lib/prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const main_model = "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const {
    question
  } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {

        // Call OpenAI API with streaming
        const response = await openai.chat.completions.create({
          model: main_model,
          messages: [
            { role: "system", content: CORE_SYS_PROMPT },
            { role: "user", content: question },
          ],
          temperature: 0,
          stream: true,
        });

        // Stream the response back to the client
        for await (const part of response) {
          const content = part.choices[0]?.delta?.content || "";
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "parrot_answer", content }) + "\n")
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
