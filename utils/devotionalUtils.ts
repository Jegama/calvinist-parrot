// utils/devotionalUtils.ts

import OpenAI from "openai";
import prisma from "@/lib/prisma";
import * as prompts from "@/lib/prompts";

const { tavily } = require("@tavily/core");

// Initialize clients
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Constants
export const MAIN_MODEL = "gpt-5-mini";

// Schema definition
export const devotionalSchema = {
    name: "devotional_schema",
    schema: {
        type: "object",
        properties: {
            title: { type: "string" },
            bible_verse: { type: "string" },
            devotional: { type: "string" },
        },
        required: ["bible_verse", "title", "devotional"],
        additionalProperties: false,
    },
};

// Generate a unique ID for the devotional based on date
export function getDevotionalId(date: Date): string {
    // Convert to US/Eastern time
    const easternTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const year = easternTime.getFullYear();
    const month = String(easternTime.getMonth() + 1).padStart(2, "0");
    const day = String(easternTime.getDate()).padStart(2, "0");
    return `${year}_${month}_${day}_morning_devotional`;
}

// Generate the prompt message for the OpenAI API
export function generateMessage(devotionalType: string, date: Date, latestNews: string): string {
    return `You are writing a ${devotionalType} devotional for ${date.toDateString()}.

Here are snippets of the latest news:
---------------------
${latestNews}
---------------------

Please output the following:

- Title: [Title of the devotional]
- Bible Verse: [The Bible verse reference of the passage you are using (e.g. Romans 3.10-12)]
- Devotional: [The content of the devotional, in the style of Charles Spurgeon's Morning and Evening Devotionals]

If it's a morning devotional, focus on encouraging people on growing on their faith, if it's an evening devotional, focus on conforting people on their faith.
  
**Note:** The output should strictly adhere to the predefined JSON schema.`;
}

// Fetch latest news using Tavily API
export async function fetchNews() {
    try {
        const response = await tavilyClient.search("Global news", {
            topic: "news",
            days: 1
        });

        const articles = response.results.map((result: any) => {
            return `${result.title}
        ${result.content}
        Published: ${result.publishedDate || 'Unknown date'}`;
        }).slice(0, 5);

        return { articles };
    } catch (error) {
        console.error("Error fetching news:", error);
        throw error;
    }
}

// Check if a devotional exists for the given ID
export async function findDevotional(devotionalId: string) {
    return await prisma.parrotDevotionals.findUnique({
        where: { devotional_id: devotionalId },
    });
}

// Create a new devotional in the database
export async function createDevotional(devotionalId: string, data: {
    bible_verse: string;
    title: string;
    devotional: string;
}) {
    return await prisma.parrotDevotionals.create({
        data: {
            devotional_id: devotionalId,
            bible_verse: data.bible_verse,
            title: data.title,
            devotional_text: data.devotional,
        },
    });
}

// Generate a devotional using OpenAI
export async function generateDevotional(date: Date) {
    // Fetch latest news
    const { articles } = await fetchNews();
    
    // Create the prompt
    const userPrompt = generateMessage("morning", date, articles);

    // System prompt
    const coreSysPrompt = prompts.CORE_SYS_PROMPT.replace("{denomination}", prompts.secondary_reformed_baptist);
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
        model: MAIN_MODEL,
        messages: [
            { role: "system", content: coreSysPrompt },
            { role: "user", content: userPrompt },
        ],
        response_format: {
            type: "json_schema",
            json_schema: devotionalSchema,
        },
    });

    if (!response.choices?.[0]?.message?.content) {
        throw new Error("Failed to generate devotional");
    }

    // Parse the response
    try {
        return JSON.parse(response.choices[0].message.content);
    } catch (jsonError) {
        console.error("Error parsing JSON:", jsonError);
        throw new Error("Failed to parse devotional response");
    }
}

