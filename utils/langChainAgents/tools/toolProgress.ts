import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export interface ToolProgressEvent {
  toolName: string;
  message?: string;
  content?: string;
}

export type ToolProgressWriter = (event: ToolProgressEvent) => void;

type LangGraphWriter = (chunk: unknown) => void;

function extractWriter(config?: LangGraphRunnableConfig): LangGraphWriter | undefined {
  return (config as LangGraphRunnableConfig & { writer?: LangGraphWriter } | undefined)?.writer;
}

export function getToolProgressWriter(
  config?: LangGraphRunnableConfig
): ToolProgressWriter | undefined {
  const writer = extractWriter(config);
  if (!writer) {
    return undefined;
  }
  return (event) => writer(event);
}
