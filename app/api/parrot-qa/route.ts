// app/api/parrot-qa/route.ts

export const maxDuration = 60;

import { NextRequest } from "next/server";
import prisma from '@/lib/prisma'
import OpenAI from 'openai'
import * as prompts from '@/lib/prompts'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ft_model = process.env.FT_MODEL || "gpt-5-mini"
const main_model = "gpt-5"
const mini_model = "gpt-5-mini"

export async function POST(req: NextRequest) {
  const { question, userId = null, denomination = "reformed-baptist" } = await req.json();
  const encoder = new TextEncoder();

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
  const new_sys_prompt = prompts.BRIEF_RESPONSE_SYS_PROMPT.replace('{CORE}', core_sys_prompt_with_denomination);

  const stream = new ReadableStream({
    async start(controller) {
      // Step 1: Categorize
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', message: 'Understanding question...' }) + '\n'));

      const message_list: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: prompts.CATEGORIZING_SYS_PROMPT },
        ...prompts.n_shot_examples,
        { role: "user", content: question }
      ]

      const categorizationResponse = await openai.chat.completions.create({
        model: mini_model,
        messages: message_list,
        response_format: {
          type: "json_schema",
          json_schema: prompts.categorizationSchema,
        },
      })

      const categorization = JSON.parse(categorizationResponse.choices[0].message.content || '{}')

      controller.enqueue(
        encoder.encode(
          JSON.stringify({ type: "categorization", data: categorization }) + "\n"
        )
      );

      if (categorization.category === "Non-Biblical Questions") {
        const refusingPrompt = prompts.refusing_prompt
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
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'refusal', content }) + '\n'));
        }

        await prisma.questionHistory.create({
          data: {
            question,
            category: categorization.category,
            subcategory: categorization.subcategory,
            issue_type: categorization.issue_type,
            reviewed_answer: refusal_respnse
          }
        })

        console.log('Refusal response:', refusal_respnse)

        controller.close();
        return;
      }

      // Step 2: Reasoning (simulating three agents)
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', message: 'Asking the Counsel of Three...' }) + '\n'));

      const reasoningPrompt = prompts.reasoning_prompt
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

      controller.enqueue(encoder.encode(JSON.stringify({
        type: 'agent_responses',
        data: { first_answer, second_answer, third_answer },
      }) + '\n'));

      // Step 3: Calvin Review
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', message: 'Calvin is reviewing the answers...' }) + '\n'));

      const calvinReviewPrompt = prompts.calvin_review
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

      controller.enqueue(
        encoder.encode(
          JSON.stringify({ type: 'calvin_review', content: calvinReviewAnswer }) + '\n'
        )
      );


      // Step 4: Synthesize Final Answer
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', message: 'Synthesizing final answer...' }) + '\n'));

      const reviewPrompt = prompts.answer_prompt
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
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'reviewed_answer', content }) + '\n'));
      }

      await prisma.questionHistory.create({
        data: {
          question,
          category: categorization.category,
          subcategory: categorization.subcategory,
          issue_type: categorization.issue_type,
          reviewed_answer: finalAnswer,
          userId: userId
        }
      })

      controller.close();

    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}