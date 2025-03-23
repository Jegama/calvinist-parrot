// utils/langChainAgents/mainAgent.ts

import { ChatOpenAI } from "@langchain/openai";
import { toolNode, toolsArray } from "./tools";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { RunnableConfig } from "@langchain/core/runnables";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mini_model = "gpt-4o-mini";

// 1) Create the Chat Model, bind tools for function calling
const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    streaming: true,
});
export const boundModel = model.bindTools(toolsArray);

// 2) Define agent state
const AgentState = Annotation.Root({
    messages: Annotation<AIMessage[]>({
        reducer: (oldMsg, newMsg) => oldMsg.concat(newMsg),
    }),
});

async function extractConciseQuery(longQuery: string): Promise<string> {
  const prompt = `You are a search query refiner for a Reformed Christian information system. Your task is to:

1. Extract the core theological question or topic from the input
2. Create a concise, focused search query (5-15 words ideal)
3. Prioritize extracting Reformed/Baptist theological concepts
4. Ignore lengthy explanations, personal stories, or non-theological content
5. If the input contains multiple questions, focus on the main theological inquiry
6. If the input is very long (like a pasted article), identify only the central theological concept

Return ONLY the refined search query without any explanation, commentary, or additional text.`;

  const messages = [
    { role: 'system' as const, content: prompt },
    { role: 'user' as const, content: longQuery }
  ];
  try {
    const response = await openai.chat.completions.create({
      model: mini_model,
      messages,
      temperature: 0,
    });
    return response.choices[0].message?.content?.trim() || longQuery;
  } catch (error) {
    return longQuery;
  }
}


// 3) The forced tool call node
async function firstModel(state: typeof AgentState.State) {
    // last user message
    const userMessage = state.messages[state.messages.length - 1];
    const userInput = userMessage?.content || "";

    // Extract a concise query from the long query using OpenAI
    const refinedQuery = await extractConciseQuery(typeof userInput === 'string' ? userInput : JSON.stringify(userInput));

    // Return an AI message that calls supplementalArticleSearch
    return {
        messages: [
            new AIMessage({
                content: "",
                tool_calls: [
                    {
                        name: "supplementalArticleSearch",
                        args: { query: refinedQuery },
                        id: "forced_gotqeustion_call",
                    },
                ],
            }),
        ],
    };
}

// 4) Normal agent call to decide next steps
async function callModel(state: typeof AgentState.State, config?: RunnableConfig) {
    const { messages } = state;
    let response: AIMessageChunk | undefined;
    for await (const chunk of await boundModel.stream(messages, config)) {
        if (!response) {
            response = chunk;
        } else {
            response = concat(response, chunk);
        }
    }
    return { messages: response ? [response as AIMessage] : [] };
}

// 5) Decide if we continue or end
function shouldContinue(state: typeof AgentState.State) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return "end";
    }
    return "continue";
}

// 6) Build the graph
const workflow = new StateGraph(AgentState)
    .addNode("first_agent", firstModel)
    .addNode("agent", callModel)
    .addNode("action", toolNode)
    .addEdge(START, "first_agent")
    .addEdge("first_agent", "action")
    .addEdge("action", "agent")
    .addConditionalEdges("agent", shouldContinue, {
        continue: "action",
        end: END,
    });

// 7) Compile and export for usage
export const parrotWorkflow = workflow.compile();
