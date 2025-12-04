import { tool } from "langchain";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Document } from "@langchain/core/documents";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

const TABLE_NAME = "data_ccel_vector_store";
const TOOL_NAME = "CCEL Retrieval";
const DEFAULT_TOP_K = 5;

interface CCELMetadata {
  file_name?: string;
  title?: string;
  author?: string;
  date?: string;
  url?: string;
  pdf_link?: string;
  page_label?: string;
}

interface ConsultedSourceEntry {
  fileName: string;
  websiteLabel: string;
  websiteHref?: string;
  pdfHref?: string;
  author?: string;
  date?: string;
  pages: Set<string>;
}

interface ConsultedSourcesPayload {
  consultedSourcesMarkdown: string;
  sourcesPayload: CCELToolPayload["sources"];
}

interface CCELToolPayload {
  query: string;
  topK: number;
  consultedSourcesMarkdown: string;
  sources: Array<{
    title: string;
    author?: string;
    date?: string;
    pageLabel?: string;
    url?: string;
    pdfLink?: string;
    excerpt: string;
  }>;
}

let vectorStorePromise: Promise<PGVectorStore> | null = null;

async function getVectorStore() {
  const connectionString = process.env.CCEL_URL?.trim();
  if (!connectionString) {
    throw new Error("CCEL_URL is not configured.");
  }

  if (!vectorStorePromise) {
    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
    });

    vectorStorePromise = PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: {
        connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
      },
      tableName: TABLE_NAME,
      columns: {
        idColumnName: "id",
        vectorColumnName: "embedding",
        contentColumnName: "text",
        metadataColumnName: "metadata_",
      },
    });
  }

  return vectorStorePromise;
}

function normalizeFileName(meta: CCELMetadata, fallback: string) {
  const base = meta.file_name || meta.title || fallback;
  return base?.replace(/\.pdf$/i, "") || fallback;
}

function formatExcerpt(text: string | undefined, maxLength = 1200) {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}…`;
}

function aggregateConsultedSources(docs: Array<Document<Record<string, unknown>>>) {
  const consulted = new Map<string, ConsultedSourceEntry>();

  docs.forEach((doc, index) => {
    const meta = (doc.metadata || {}) as CCELMetadata;
    const key = normalizeFileName(meta, `source-${index + 1}`);

    if (!consulted.has(key)) {
      const websiteLabel = meta.title || key;
      consulted.set(key, {
        fileName: key,
        websiteLabel,
        websiteHref: meta.url,
        pdfHref: meta.pdf_link,
        author: meta.author,
        date: meta.date,
        pages: new Set<string>(),
      });
    }

    const entry = consulted.get(key)!;
    if (meta.page_label) {
      entry.pages.add(meta.page_label);
    }
  });

  return consulted;
}

function formatConsultedSourcesMarkdown(entries: Map<string, ConsultedSourceEntry>) {
  if (!entries.size) {
    return "No consulted sources were found.";
  }

  const sections: string[] = [];
  entries.forEach((entry) => {
    const titleLink = entry.websiteHref ? `[${entry.websiteLabel}](${entry.websiteHref})` : entry.websiteLabel;
    const block: string[] = [`- **Book:** ${titleLink}`];

    if (entry.author || entry.date) {
      const author = entry.author ?? "Unknown author";
      const date = entry.date ? ` (${entry.date})` : "";
      block.push(`  - Author: ${author}${date}`);
    }

    if (entry.pages.size) {
      block.push(`  - Pages: ${Array.from(entry.pages).join(", ")}`);
    }

    if (entry.pdfHref) {
      block.push(`  - [PDF](${entry.pdfHref})`);
    }

    sections.push(block.join("\n"));
  });

  return sections.join("\n\n");
}

function buildConsultedSourcesPayload(docs: Array<Document<Record<string, unknown>>>): ConsultedSourcesPayload {
  const entries = aggregateConsultedSources(docs);
  const consultedSourcesMarkdown = formatConsultedSourcesMarkdown(entries);

  const sourcesPayload = docs.map((doc, index) => {
    const meta = (doc.metadata || {}) as CCELMetadata;
    return {
      title: meta.title || normalizeFileName(meta, `source-${index + 1}`),
      author: meta.author,
      date: meta.date,
      pageLabel: meta.page_label,
      url: meta.url,
      pdfLink: meta.pdf_link,
      excerpt: formatExcerpt(doc.pageContent),
    };
  });

  return {
    consultedSourcesMarkdown,
    sourcesPayload,
  };
}

async function retrieveFromCCEL(
  input: { query: string; },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const writer = getToolProgressWriter(config);
  const query = input.query.trim();
  if (!query) {
    return JSON.stringify({ error: "Query is required" });
  }

  console.log(`CCEL Retrieval Tool invoked with query: "${query}"`);

  let progressInterval: NodeJS.Timeout | null = null;

  try {
    writer?.({ toolName: TOOL_NAME, message: "Connecting to CCEL vector store..." });
    const store = await getVectorStore();

    writer?.({ toolName: TOOL_NAME, message: `Searching for references related to "${query}"...` });
    progressInterval = setInterval(() => {
      writer?.({ toolName: TOOL_NAME, message: "Still retrieving CCEL passages..." });
    }, 30000);
    const docs = await store.similaritySearch(query, DEFAULT_TOP_K);

    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    if (!docs.length) {
      writer?.({ toolName: TOOL_NAME, content: "No CCEL sources matched the query." });
      return JSON.stringify({
        query,
        topK: 0,
        consultedSourcesMarkdown: "No consulted sources were found.",
        sources: [],
      });
    }

    const { consultedSourcesMarkdown, sourcesPayload } = buildConsultedSourcesPayload(docs);

    const payload: CCELToolPayload = {
      query,
      topK: docs.length,
      consultedSourcesMarkdown,
      sources: sourcesPayload,
    };

    console.log("CCEL Retrieval Payload:", payload);

    return JSON.stringify(payload);
  } catch (error) {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    const message = error instanceof Error ? error.message : String(error);
    writer?.({ toolName: TOOL_NAME, message: `⚠️ CCEL retrieval failed: ${message}` });
    writer?.({
      toolName: TOOL_NAME,
      content: `### CCEL Retrieval Error\n\nUnable to fetch CCEL sources right now.\n\n**Error**: ${message}`,
    });

    return JSON.stringify({ error: message });
  }
}

export const ccelRetrievalTool = tool(retrieveFromCCEL, {
  name: "ccelRetrieval",
  description: "Retrieve sourced historical theology excerpts from the CCEL PGVector store.",
  schema: z.object({
    query: z.string().describe("The theological query to answer using CCEL sources")
  }),
});
