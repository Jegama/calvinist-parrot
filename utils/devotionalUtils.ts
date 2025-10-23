// utils/devotionalUtils.ts

import OpenAI from "openai";
import { tavily } from "@tavily/core";
import prisma from "@/lib/prisma";
import * as prompts from "@/lib/prompts";

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
export function generateMessage(
        devotionalType: string,
        date: Date,
        latestNews: string | string[]
    ): string {
        const newsBlock = Array.isArray(latestNews) ? latestNews.join("\n\n") : latestNews;
    return `You are writing a ${devotionalType} devotional for ${date.toDateString()}.

Here are snippets of the latest news:
---------------------
${newsBlock}
---------------------

Please output the following:

- Title: [Title of the devotional]
- Bible Verse: [The Bible verse reference of the passage you are using (e.g. Romans 3:10-12)]
- Devotional: [The content of the devotional, in the style of Charles Spurgeon's Morning and Evening Devotionals. Do not include the Bible verse at the top since you are giving it in the previous field.]

Make sure the devotional is between 300-500 words. Use a warm and engaging tone, and ensure it is theologically sound.

If it's a morning devotional, focus on encouraging people on growing on their faith, if it's an evening devotional, focus on comforting people on their faith.
  
**Note:** The output should strictly adhere to the predefined JSON schema.`;
}

// Fetch latest news using Tavily API
export async function fetchNews() {
    type TavilySearchResult = {
        title?: string;
        content?: string;
        publishedDate?: string;
    };

    type TavilySearchResponse = {
        results?: TavilySearchResult[];
    };

    try {
        const response = (await tavilyClient.search("Global news", {
            topic: "news",
            days: 1
        })) as TavilySearchResponse;

        const articles = Array.isArray(response.results)
            ? response.results
                    .slice(0, 5)
                    .map((result) => {
                        const title = result.title ?? "Untitled";
                        const content = result.content ?? "No summary available.";
                        const publishedDate = result.publishedDate || "Unknown date";
                        return `${title}
        ${content}
        Published: ${publishedDate}`;
                    })
            : [];

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

// Create or update a devotional in the database (handles race conditions)
export async function createDevotional(devotionalId: string, data: {
    bible_verse: string;
    title: string;
    devotional: string;
}) {
    return await prisma.parrotDevotionals.upsert({
        where: { devotional_id: devotionalId },
        update: {
            bible_verse: data.bible_verse,
            title: data.title,
            devotional_text: data.devotional,
        },
        create: {
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

