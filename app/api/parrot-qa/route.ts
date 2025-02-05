// app/api/parrot-qa/route.ts

export const maxDuration = 60;

import { NextRequest } from "next/server";
import prisma from '@/lib/prisma'
import OpenAI from 'openai'
import * as prompts from '@/lib/prompts'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ft_model = process.env.FT_MODEL || "gpt-4o-mini"
const main_model = "gpt-4o"
const mini_model = "gpt-4o-mini"

export async function POST(req: NextRequest) {
  const { question, userId = null, denomination = "reformed-baptist" } = await req.json();
  const encoder = new TextEncoder();

  // Map denomination to corresponding system prompt
  let sys_prompt;
  switch (denomination) {
    case "reformed-baptist":
      sys_prompt = prompts.CORE_SYS_PROMPT;
      break;
    case "presbyterian":
      sys_prompt = prompts.CORE_SYS_PROMPT_PRESBYTERIAN;
      break;
    case "wesleyan":
      sys_prompt = prompts.CORE_SYS_PROMPT_WESLEYAN;
      break;
    case "lutheran":
      sys_prompt = prompts.CORE_SYS_PROMPT_LUTHERAN;
      break;
    case "anglican":
      sys_prompt = prompts.CORE_SYS_PROMPT_ANGLICAN;
      break;
    case "pentecostal":
      sys_prompt = prompts.CORE_SYS_PROMPT_PENTECOSTAL;
      break;
    case "non-denom":
      sys_prompt = prompts.CORE_SYS_PROMPT_NON_DENOM_EVANGELICAL;
      break;
    default:
      sys_prompt = prompts.CORE_SYS_PROMPT;
  }

  const new_quick_chat = prompts.QUICK_CHAT_SYS_PROMPT.replace('{CORE}', sys_prompt);

  const stream = new ReadableStream({
    async start(controller) {
      // Step 1: Categorize
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', message: 'Understanding question...' }) + '\n'));
      
      const message_list: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {role: "system", content: prompts.CATEGORIZING_SYS_PROMPT},
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
        temperature: 0
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
            { role: "system", content: new_quick_chat },
            { role: "user", content: refusingPrompt }
          ],
          temperature: 0,
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
            // { role: "system", content: new_quick_chat },
            { role: "user", content: reasoningPrompt }
          ],
          temperature: 1
        }),
        openai.chat.completions.create({
          model: mini_model,
          messages: [
            { role: "system", content: new_quick_chat },
            { role: "user", content: reasoningPrompt }
          ],
          temperature: 1
        }),
        openai.chat.completions.create({
          model: mini_model,
          messages: [
            { role: "system", content: prompts.CALVIN_QUICK_SYS_PROMPT },
            { role: "user", content: reasoningPrompt }
          ],
          temperature: 1
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
        temperature: 0
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
          { role: "system", content: new_quick_chat },
          { role: "user", content: reviewPrompt }
        ],
        temperature: 0,
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