import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CORE_EXTRACTION_THINKING_LEVEL,
  EVALUATION_MODEL,
  EVALUATION_PROMPT_VERSION,
  extractChurchEvaluation,
} from "./extract";

const unknownCore = {
  trinity: "unknown",
  gospel: "unknown",
  justification_by_faith: "unknown",
  christ_deity_humanity: "true",
  scripture_authority: "unknown",
  incarnation_virgin_birth: "unknown",
  atonement_necessary_sufficient: "unknown",
  resurrection_of_jesus: "unknown",
  return_and_judgment: "unknown",
  character_of_god: "unknown",
};

describe("extractChurchEvaluation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses model-selected multilingual pages and the stable Gemini configuration", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const responses = [
      {
        name: "Iglesia Ejemplo",
        website: "https://ejemplo.iglesia/",
        addresses: [],
        contacts: { phone: null, email: null },
        service_times: [],
        best_pages_for: {
          beliefs: "https://ejemplo.iglesia/creemos",
          confession: null,
          about: null,
          leadership: "https://ejemplo.iglesia/liderazgo",
        },
      },
      {
        core_doctrines: unknownCore,
        notes: [{
          label: "christ_deity_humanity",
          text:
            "Jesucristo es verdaderamente Dios y verdaderamente hombre.",
          source_url: "https://ejemplo.iglesia/creemos",
        }],
      },
      {
        secondary: {
          baptism: null,
          governance: null,
          lords_supper: null,
          gifts: null,
          sanctification: null,
          continuity: null,
          security: null,
          atonement_model: null,
        },
        badges: [],
      },
      {
        tertiary: {
          eschatology: null,
          worship_style: null,
          counseling: null,
          creation: null,
          christian_liberty: null,
          discipline: null,
          parachurch: null,
          marriage_roles: null,
        },
        badges: [],
      },
      {
        denomination: {
          label: null,
          confidence: 0,
          signals: [],
        },
        confession: {
          adopted: false,
          name: null,
          source_url: null,
        },
        badges: [],
        notes: [],
      },
      {
        badges: ["👩‍🏫 Ordained Women"],
        notes: [{
          label: "Ordained Women",
          text: "María López — Pastora. Ella dirige la congregación.",
          source_url: "https://ejemplo.iglesia/liderazgo",
        }],
      },
    ];
    const generateContent = vi.fn();
    for (const response of responses) {
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify(response),
      });
    }
    const client = {
      models: { generateContent },
    } as unknown as GoogleGenAI;
    const crawl = vi.fn(async () => ({
      base_url: "https://ejemplo.iglesia/",
      results: [{
        url: "https://ejemplo.iglesia/beliefs",
        rawContent: "Página de inicio.",
      }],
    }));
    const extractPage = vi.fn(async (url: string) => ({
      requestedUrl: url,
      url,
      rawContent: url.endsWith("/creemos")
        ? "Jesucristo es verdaderamente Dios y verdaderamente hombre."
        : "María López — Pastora. Ella dirige la congregación.",
      favicon: null,
    }));

    const result = await extractChurchEvaluation(
      "https://ejemplo.iglesia/",
      { client, crawl, extractPage },
    );

    expect(extractPage).toHaveBeenCalledTimes(2);
    expect(extractPage).toHaveBeenCalledWith(
      "https://ejemplo.iglesia/creemos",
    );
    expect(extractPage).toHaveBeenCalledWith(
      "https://ejemplo.iglesia/liderazgo",
    );
    expect(extractPage).not.toHaveBeenCalledWith(
      "https://ejemplo.iglesia/beliefs",
    );
    expect(generateContent).toHaveBeenCalledTimes(6);
    expect(generateContent.mock.calls.every(
      ([request]) => request.model === "gemini-3.6-flash",
    )).toBe(true);
    expect(
      generateContent.mock.calls[1][0].config.thinkingConfig.thinkingLevel,
    ).toBe(ThinkingLevel.MEDIUM);
    for (const call of generateContent.mock.calls.filter((_, index) =>
      index !== 1
    )) {
      expect(call[0].config.thinkingConfig.thinkingLevel).toBe(
        ThinkingLevel.LOW,
      );
    }
    expect(result.church.core_doctrines.christ_deity_humanity).toBe("true");
    expect(result.church.badges).toContain("👩‍🏫 Ordained Women");
    expect(result.metadata).toMatchObject({
      model: "gemini-3.6-flash",
      prompt_version: EVALUATION_PROMPT_VERSION,
    });
    expect(result.metadata?.source_pages).toHaveLength(3);
  });

  it("exports the production model and medium core thinking level", () => {
    expect(EVALUATION_MODEL).toBe("gemini-3.6-flash");
    expect(CORE_EXTRACTION_THINKING_LEVEL).toBe(ThinkingLevel.MEDIUM);
    expect(EVALUATION_PROMPT_VERSION).not.toBe("2026-07-26");
  });
});
