import { NextResponse } from 'next/server';
import OpenAI from "openai";
import { getJson } from "serpapi";
import { JSDOM } from "jsdom";
import prisma from "@/lib/prisma";
import * as prompts from "@/lib/prompts";

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const main_model = "gpt-4o-mini";

const devotionalSchema = {
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

function getDevotionalId(date: Date): string {
    // Convert to US/Eastern time
    const easternTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const year = easternTime.getFullYear();
    const month = String(easternTime.getMonth() + 1).padStart(2, "0");
    const day = String(easternTime.getDate()).padStart(2, "0");
    return `${year}_${month}_${day}_morning_devotional`;
}

function generateMessage(devotionalType: string, date: Date, latestNews: string): string {
    const message = `You are writing a ${devotionalType} devotional for ${date.toDateString()}.

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

    return message;
}

function parseHtml(html: string): Document {
    const dom = new JSDOM(html);
    return dom.window.document;
}

function getArticle(doc: Document | HTMLElement, found = false): string {
    const divs = Array.from(doc.getElementsByTagName("div"));
    const start = divs.length;
  
    const divTextLengths = divs.map((div) => (div.textContent?.length ?? 0));
    const maxIndex = divTextLengths.indexOf(Math.max(...divTextLengths));
    const longestDiv = divs[maxIndex];
    const end = longestDiv.getElementsByTagName("div").length;
  
    if (end === 0) {
      let article = doc.textContent || "";
      article = article
        .replace(/\n/g, "")
        .replace(/\xa0/g, " ")
        .replace(/\t/g, " ")
        .replace(/\r/g, " ")
        .replace(/ {2,}/g, " ");
      return article.split(" ").slice(0, 50).join(" ");
    }
  
    // Decide if we found a big enough div
    found = start - end >= 50;
  
    if (found) {
      let article = longestDiv.textContent ?? "";
      article = article
        .replace(/\n/g, "")
        .replace(/\xa0/g, " ")
        .replace(/\t/g, " ")
        .replace(/\r/g, " ")
        .replace(/ {2,}/g, " ");
      return article.split(" ").slice(0, 50).join(" ");
    } else {
      return getArticle(longestDiv, false);
    }
}
  
async function fetchNews() {
    const articles: string[] = [];
    const params = {
        engine: "google",
        q: "latest news",
        api_key: process.env.SERPAPI_API_KEY,
    };
  
    try {
        const results = await getJson(params);
        const links: string[] = [];
    
        for (const story of results.top_stories?.slice(0, 5) ?? []) {
            links.push(story.link);
            const response = await fetch(story.link);
            const html = await response.text();
            const doc = parseHtml(html);
    
            if (doc.getElementsByTagName("div").length > 0) {
                articles.push(`${story.title} - ${getArticle(doc)}`);
            }
        }
    
        return {
            articles,
            links,
        };
    } catch (error) {
        console.error("Error fetching news:", error);
        throw error;
    }
}

export async function GET(request: Request) {
    // Check for authorization
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const devotionalId = getDevotionalId(now);
    
        // Check if we already have a devotional for today
        const existing = await prisma.parrotDevotionals.findUnique({
            where: { devotional_id: devotionalId },
        });

        // If devotional already exists, just return success
        if (existing) {
            return NextResponse.json({
                success: true,
                message: "Devotional already exists for today",
                id: devotionalId
            });
        }

        // Generate new devotional
        const { articles } = await fetchNews();
        const latestNews = articles.join("\n\n---\n\n");
        
        const userPrompt = generateMessage("morning", now, latestNews);
        const response = await openai.chat.completions.create({
            model: main_model,
            messages: [
                { role: "system", content: prompts.CORE_SYS_PROMPT },
                { role: "user", content: userPrompt },
            ],
            temperature: 0,
            response_format: {
                type: "json_schema",
                json_schema: devotionalSchema,
            },
        });

        if (!response.choices?.[0]?.message?.content) {
            throw new Error("Failed to generate devotional");
        }

        const structured = JSON.parse(response.choices[0].message.content);
        
        // Store in DB and get the ID
        await prisma.parrotDevotionals.create({
            data: {
                devotional_id: devotionalId,
                bible_verse: structured.bible_verse,
                title: structured.title,
                devotional_text: structured.devotional,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Devotional generated successfully",
            id: devotionalId
        });
        
    } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
