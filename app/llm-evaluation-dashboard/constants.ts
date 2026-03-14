export const COLORS: Record<string, string> = {
  google: "hsl(var(--chart-google))",
  openai: "hsl(var(--chart-openai))",
  xai: "hsl(var(--chart-xai))",
  anthropic: "hsl(var(--chart-anthropic))",
  googleLight: "hsl(var(--chart-google) / 0.5)",
  openaiLight: "hsl(var(--chart-openai) / 0.5)",
  xaiLight: "hsl(var(--chart-xai) / 0.5)",
  anthropicLight: "hsl(var(--chart-anthropic) / 0.5)",
};

export const PROVIDER_LABELS: Record<string, string> = {
  google: "Google (Gemini)",
  openai: "OpenAI (GPT)",
  xai: "xAI (Grok)",
  anthropic: "Anthropic (Claude)",
};

const PROVIDER_BRANDS: Record<string, string> = {
  google: "Google",
  openai: "OpenAI",
  xai: "xAI",
  anthropic: "Anthropic",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-preview": "Gemini 2.5 Flash",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-flash-preview": "Gemini 3 Flash",
  "gpt-5-mini": "GPT-5 Mini",
  "grok-4-1-fast": "Grok 4.1 Fast",
  "grok-4-1-fast-reasoning": "Grok 4.1 Fast",
};

const FALLBACK_PROVIDER_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(\.\d+)*$/.test(part)) {
        return part;
      }

      const lowered = part.toLowerCase();
      if (lowered === "gpt") return "GPT";
      if (lowered === "xai") return "xAI";
      if (lowered === "ai") return "AI";

      return lowered.charAt(0).toUpperCase() + lowered.slice(1);
    })
    .join(" ");
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function humanizeModelIdentifier(model: string): string {
  const tokens = model.split("-").filter(Boolean);
  if (tokens.length === 0) {
    return model;
  }

  const [family, ...rest] = tokens;
  const familyLabel =
    family === "gpt"
      ? "GPT"
      : family === "xai"
        ? "xAI"
        : titleCase(family);

  const versionTokens: string[] = [];
  let cursor = 0;
  while (cursor < rest.length && /^\d+(\.\d+)*$/.test(rest[cursor])) {
    versionTokens.push(rest[cursor]);
    cursor += 1;
  }

  const version = versionTokens.length > 0 ? versionTokens.join(".") : "";
  const prefix = version
    ? family === "gpt"
      ? `${familyLabel}-${version}`
      : `${familyLabel} ${version}`
    : familyLabel;
  const suffix = rest.slice(cursor).map((token) => titleCase(token)).join(" ");

  return suffix ? `${prefix} ${suffix}` : prefix;
}

export function formatPromptLabel(label: string): string {
  if (!label) {
    return "Unknown";
  }

  if (/^(baseline|vanilla)$/i.test(label)) {
    return "Baseline";
  }

  return label.replace(/_/g, ".");
}

export function inferProviderFromModel(model: string): string | null {
  const normalized = model.toLowerCase();

  if (normalized.includes("gemini")) return "google";
  if (normalized.includes("gpt") || normalized.includes("openai")) return "openai";
  if (normalized.includes("grok") || normalized.includes("xai")) return "xai";
  if (normalized.includes("claude") || normalized.includes("anthropic")) return "anthropic";

  return null;
}

export function formatModelLabel(model: string): string {
  if (!model) {
    return "Unknown Model";
  }

  const normalized = model
    .replace(/-preview-\d{2}-\d{4}$/i, "")
    .replace(/-preview$/i, "")
    .replace(/-reasoning$/i, "")
    .replace(/-\d{8}$/i, "");

  return MODEL_LABELS[model] ?? MODEL_LABELS[normalized] ?? humanizeModelIdentifier(normalized);
}

export function getProviderColor(provider: string, light = false): string {
  const toneKey = light ? `${provider}Light` : provider;
  const knownColor = COLORS[toneKey];

  if (knownColor) {
    return knownColor;
  }

  const fallback = FALLBACK_PROVIDER_COLORS[hashString(provider) % FALLBACK_PROVIDER_COLORS.length];
  return light ? fallback.replace(")", " / 0.5)") : fallback;
}

export function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? titleCase(provider);
}

export function getProviderBrand(provider: string): string {
  return PROVIDER_BRANDS[provider] ?? titleCase(provider);
}

export function formatJudgeLabel(model: string): string {
  const provider = inferProviderFromModel(model);
  const modelLabel = formatModelLabel(model);

  if (!provider) {
    return `Graded by ${modelLabel}`;
  }

  return `Graded by ${modelLabel} (${getProviderBrand(provider)})`;
}
