// Shared Parrot QA runtime used by the versioned API and legacy adapter.

import prisma from "@/lib/prisma";
import OpenAI from "openai";
import * as prompts from "@/lib/prompts/core";
import * as qaPrompts from "@/lib/prompts/parrot-qa";
import { getChatActorId, resolveChatActor } from "@/lib/guest";
import {
  executeLegacySafely,
  executeV1Safely,
  LEGACY_API_HEADERS,
  parseJsonRequest,
  recordLegacyApiUse,
  withHeaders,
} from "@/lib/api/handlers/http";
import {
  legacyQaRequestSchema,
  qaRequestSchema,
} from "@/lib/api/contracts";
import { sendQaProgress } from "@/lib/progressUtils";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ft_model = process.env.FT_MODEL || "gpt-4.1-mini"
const main_model = "gpt-4.1"
const mini_model = "gpt-4.1-mini"

export type QaCommand = {
  question: string;
  denomination?: string;
  externalUserId?: string;
};

export type QaExecutor = (
  command: QaCommand,
  contentType?: string,
) => Promise<Response>;

export async function executeQa(
  command: QaCommand,
  contentType = "application/x-ndjson; charset=utf-8",
) {
  const {
    question,
    denomination = "reformed-baptist",
    externalUserId,
  } = command;
  const resolvedUserId = getChatActorId(
    await resolveChatActor({ externalUserId }),
  );

  // Map denomination to corresponding system prompt
  let secondary_prompt_text;
  switch (denomination) {
    case "reformed-baptist":
      secondary_prompt_text = prompts.secondary_reformed_baptist;
      break;
    case "presbyterian":
      secondary_prompt_text = prompts.secondary_presbyterian;
      break;
    case "wesleyan":
      secondary_prompt_text = prompts.secondary_wesleyan;
      break;
    case "lutheran":
      secondary_prompt_text = prompts.secondary_lutheran;
      break;
    case "anglican":
      secondary_prompt_text = prompts.secondary_anglican;
      break;
    case "pentecostal":
      secondary_prompt_text = prompts.secondary_pentecostal;
      break;
    case "non-denom":
      secondary_prompt_text = prompts.secondary_non_denom;
      break;
    default:
      secondary_prompt_text = prompts.secondary_reformed_baptist; // Default to reformed-baptist
  }

  const core_sys_prompt_with_denomination = prompts.CORE_SYS_PROMPT.replace('{denomination}', secondary_prompt_text);
  const new_sys_prompt = qaPrompts.BRIEF_RESPONSE_SYS_PROMPT.replace('{CORE}', core_sys_prompt_with_denomination);

  const stream = new ReadableStream({
    async start(controller) {
      let stage = "categorization";
      try {
        // Step 1: Categorize
        sendQaProgress(
          { type: "progress", message: "Understanding question..." },
          controller,
        );

        const message_list: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: qaPrompts.CATEGORIZING_SYS_PROMPT },
          ...qaPrompts.n_shot_examples,
          { role: "user", content: question }
        ]

        const categorizationResponse = await openai.chat.completions.create({
          model: mini_model,
          messages: message_list,
          response_format: {
            type: "json_schema",
            json_schema: qaPrompts.categorizationSchema,
          },
        })

        const categorization = JSON.parse(categorizationResponse.choices[0].message.content || '{}')

        sendQaProgress(
          { type: "categorization", data: categorization },
          controller,
        );

        if (categorization.category === "Non-Biblical Questions") {
          stage = "refusal";
          const refusingPrompt = qaPrompts.refusing_prompt
            .replace('{user_question}', question)
            .replace('{category}', categorization.category)
            .replace('{subcategory}', categorization.subcategory)

          const refuseResponse = await openai.chat.completions.create({
            model: mini_model,
            messages: [
              { role: "system", content: new_sys_prompt },
              { role: "user", content: refusingPrompt }
            ],
            stream: true
          })

          let refusal_respnse = ''

          for await (const part of refuseResponse) {
            const content = part.choices[0]?.delta?.content || '';
            refusal_respnse += content;
            sendQaProgress({ type: "refusal", content }, controller);
          }

          await prisma.questionHistory.create({
            data: {
              question,
              category: categorization.category,
              subcategory: categorization.subcategory,
              issue_type: categorization.issue_type,
              reviewed_answer: refusal_respnse,
              userId: resolvedUserId || undefined,
            }
          })

          console.log('Refusal response:', refusal_respnse)

          sendQaProgress({ type: "done" }, controller);
          return;
        }

        // Step 2: Reasoning (simulating three agents)
        stage = "agent_responses";
        sendQaProgress(
          {
            type: "progress",
            message: "Asking the Counsel of Three...",
          },
          controller,
        );

      const reasoningPrompt = qaPrompts.reasoning_prompt
        .replace('{user_question}', question)
        .replace('{reformatted_question}', categorization.reformatted_question)
        .replace('{category}', categorization.category)
        .replace('{subcategory}', categorization.subcategory)
        .replace('{issue_type}', categorization.issue_type)

      const [responseA, responseB, responseC] = await Promise.all([
        openai.chat.completions.create({
          model: ft_model,
          messages: [
            { role: "user", content: reasoningPrompt }
          ],
        }),
        openai.chat.completions.create({
          model: mini_model,
          messages: [
            { role: "system", content: new_sys_prompt },
            { role: "user", content: reasoningPrompt }
          ],
        }),
        openai.chat.completions.create({
          model: mini_model,
          messages: [
            { role: "system", content: prompts.CALVIN_QUICK_SYS_PROMPT },
            { role: "user", content: reasoningPrompt }
          ],
        })
      ])

      const first_answer = responseA.choices[0].message.content
      const second_answer = responseB.choices[0].message.content
      const third_answer = responseC.choices[0].message.content

        sendQaProgress(
          {
            type: "agent_responses",
            data: { first_answer, second_answer, third_answer },
          },
          controller,
        );

        // Step 3: Calvin Review
        stage = "calvin_review";
        sendQaProgress(
          {
            type: "progress",
            message: "Calvin is reviewing the answers...",
          },
          controller,
        );

      const calvinReviewPrompt = qaPrompts.calvin_review
        .replace('{user_question}', question)
        .replace('{reformatted_question}', categorization.reformatted_question)
        .replace('{category}', categorization.category)
        .replace('{subcategory}', categorization.subcategory)
        .replace('{issue_type}', categorization.issue_type)
        .replace('{first_answer}', first_answer || '')
        .replace('{second_answer}', second_answer || '')
        .replace('{third_answer}', third_answer || '')

      const calvinReviewResponse = await openai.chat.completions.create({
        model: mini_model,
        messages: [
          { role: "system", content: prompts.CALVIN_QUICK_SYS_PROMPT },
          { role: "user", content: calvinReviewPrompt }
        ],
      })

      const calvinReviewAnswer = calvinReviewResponse.choices[0].message.content

      // console.log(calvinReviewAnswer)

        sendQaProgress(
          { type: "calvin_review", content: calvinReviewAnswer },
          controller,
        );


        // Step 4: Synthesize Final Answer
        stage = "reviewed_answer";
        sendQaProgress(
          { type: "progress", message: "Synthesizing final answer..." },
          controller,
        );

      const reviewPrompt = qaPrompts.answer_prompt
        .replace('{user_question}', question)
        .replace('{reformatted_question}', categorization.reformatted_question)
        .replace('{category}', categorization.category)
        .replace('{subcategory}', categorization.subcategory)
        .replace('{issue_type}', categorization.issue_type)
        .replace('{first_answer}', first_answer || '')
        .replace('{second_answer}', second_answer || '')
        .replace('{third_answer}', third_answer || '')
        .replace('{calvin_review}', calvinReviewAnswer || '')

      const reviewResponse = await openai.chat.completions.create({
        model: main_model,
        messages: [
          { role: "system", content: new_sys_prompt },
          { role: "user", content: reviewPrompt }
        ],
        stream: true
      })

      let finalAnswer = ''

        for await (const part of reviewResponse) {
          const content = part.choices[0]?.delta?.content || '';
          finalAnswer += content;
          sendQaProgress({ type: "reviewed_answer", content }, controller);
        }

        await prisma.questionHistory.create({
          data: {
            question,
            category: categorization.category,
            subcategory: categorization.subcategory,
            issue_type: categorization.issue_type,
            reviewed_answer: finalAnswer,
            userId: resolvedUserId || undefined,
          }
        })

        sendQaProgress({ type: "done" }, controller);
      } catch (error) {
        console.error(`Error during Parrot QA ${stage}:`, error);
        sendQaProgress(
          {
            type: "error",
            stage,
            message: "We couldn't finish this response.",
          },
          controller,
        );
        sendQaProgress({ type: "done" }, controller);
      } finally {
        try {
          controller.close();
        } catch {
          // The client may have closed the stream.
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handleLegacyQaPost(
  request: Request,
  execute: QaExecutor = executeQa,
) {
  recordLegacyApiUse(request, "/api/parrot-qa");

  const parsed = await parseJsonRequest(request, legacyQaRequestSchema);
  if (!parsed.success) {
    return withHeaders(parsed.response, LEGACY_API_HEADERS);
  }

  return executeLegacySafely(() =>
    execute(
      {
        question: parsed.data.question,
        denomination: parsed.data.denomination,
        externalUserId: parsed.data.userId,
      },
      "text/plain; charset=utf-8",
    ),
  );
}

export async function handleQa(
  request: Request,
  execute: QaExecutor = executeQa,
) {
  const parsed = await parseJsonRequest(request, qaRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  return executeV1Safely(() =>
    execute({
      question: parsed.data.question,
      denomination: parsed.data.denomination,
    }),
  );
}
