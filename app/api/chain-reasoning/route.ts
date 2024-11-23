import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { 
  CATEGORIZING_SYS_PROMPT, 
  QUICK_CHAT_SYS_PROMPT, 
  CALVIN_QUICK_SYS_PROMPT,
  reasoning_prompt,
  answer_prompt
  // follow_up_prompt
} from '@/lib/prompts'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ft_model = process.env.FT_MODEL || "gpt-4o-mini"
const main_model = "gpt-4o"
const mini_model = "gpt-4o-mini"

export async function POST(req: Request) {
  const { question } = await req.json()

  // Step 1: Categorize
  const categorizationResponse = await openai.chat.completions.create({
    model: mini_model,
    messages: [
      { role: "system", content: CATEGORIZING_SYS_PROMPT },
      { role: "user", content: question }
    ],
    response_format: { type: "json_object" },
    temperature: 0
  })

  const categorization = JSON.parse(categorizationResponse.choices[0].message.content || '{}')

  if (categorization.category === "Non-Biblical Questions") {
    return NextResponse.json({ refuse_answer: "I'm sorry, but I can only answer questions related to Christianity and theology." })
  }

  // Step 2: Reasoning (simulating three agents)
  const reasoningPrompt = reasoning_prompt
    .replace('{user_question}', question)
    .replace('{reformatted_question}', categorization.reformatted_question)
    .replace('{category}', categorization.category)
    .replace('{subcategory}', categorization.subcategory)
    .replace('{issue_type}', categorization.issue_type)

  const [responseA, responseB, responseC] = await Promise.all([
    openai.chat.completions.create({
      model: ft_model,
      messages: [
        { role: "system", content: QUICK_CHAT_SYS_PROMPT },
        { role: "user", content: reasoningPrompt }
      ],
      temperature: 0.7
    }),
    openai.chat.completions.create({
      model: mini_model,
      messages: [
        { role: "system", content: QUICK_CHAT_SYS_PROMPT },
        { role: "user", content: reasoningPrompt }
      ],
      temperature: 0.7
    }),
    openai.chat.completions.create({
      model: mini_model,
      messages: [
        { role: "system", content: CALVIN_QUICK_SYS_PROMPT },
        { role: "user", content: reasoningPrompt }
      ],
      temperature: 0.7
    })
  ])

  const first_answer = responseA.choices[0].message.content
  const second_answer = responseB.choices[0].message.content
  const third_answer = responseC.choices[0].message.content

  // Step 3: Review and synthesize
  const reviewPrompt = answer_prompt
    .replace('{user_question}', question)
    .replace('{reformatted_question}', categorization.reformatted_question)
    .replace('{category}', categorization.category)
    .replace('{subcategory}', categorization.subcategory)
    .replace('{issue_type}', categorization.issue_type)
    .replace('{first_answer}', first_answer || '')
    .replace('{second_answer}', second_answer || '')
    .replace('{third_answer}', third_answer || '')

  const reviewResponse = await openai.chat.completions.create({
    model: main_model,
    messages: [
      { role: "system", content: QUICK_CHAT_SYS_PROMPT },
      { role: "user", content: reviewPrompt }
    ],
    temperature: 0
  })

  const reviewed_answer = reviewResponse.choices[0].message.content

  return NextResponse.json({
    user_question: question,
    reformatted_question: categorization.reformatted_question,
    category: categorization.category,
    subcategory: categorization.subcategory,
    issue_type: categorization.issue_type,
    first_answer,
    second_answer,
    third_answer,
    reviewed_answer
  })
}

