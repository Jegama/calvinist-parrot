import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CORE_EXTRACTION_THINKING_LEVEL,
  EVALUATION_MODEL,
  EVALUATION_PROMPT_VERSION,
  extractChurchEvaluation,
} from "./extract";
import {
  BASIC_FIELDS_SCHEMA, CORE_DOCTRINES_SCHEMA, CORE_DOCTRINE_KEYS,
  SECONDARY_DOCTRINES_SCHEMA, TERTIARY_DOCTRINES_SCHEMA,
  DENOMINATION_CONFESSION_SCHEMA, RED_FLAGS_SCHEMA,
} from "../schemas/church-finder";
import { postProcessEvaluation } from "./post-process";

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

  it.each([false, true])("uses multilingual pages and integrates assessed confession evidence (adopted=%s)", async (adopted) => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const adoptionQuote = "Adoptamos la Confesión Bautista de Londres de 1689 como nuestra norma doctrinal.";
    const responses = [
      {
        name: "Iglesia Ejemplo",
        website: "https://ejemplo.iglesia/",
        addresses: [],
        contacts: { phone: null, email: null },
        service_times: [],
        affiliation_pages: [],
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
        affiliations: [],
        confession: {
          adopted,
          name: adopted ? "Second London Baptist Confession (1689)" : null,
          source_url: adopted ? "https://ejemplo.iglesia/creemos" : null,
          affirmed_core_doctrines: adopted ? CORE_DOCTRINE_KEYS : [],
        },
        badges: [],
        notes: adopted ? [{
          label: "Adopted Confession",
          text: adoptionQuote,
          source_url: "https://ejemplo.iglesia/creemos",
        }] : [],
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
        ? `Jesucristo es verdaderamente Dios y verdaderamente hombre. ${adopted ? adoptionQuote : ""}`
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
      ([request]) => request.model === "gemini-3.8-flash",
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
      model: "gemini-3.8-flash",
      prompt_version: EVALUATION_PROMPT_VERSION,
    });
    expect(result.metadata?.source_pages).toHaveLength(3);
    expect(result.metadata?.confession_inferred_core).toHaveLength(adopted ? 9 : 0);
    expect(result.church.core_doctrines.trinity).toBe(adopted ? "true" : "unknown");
    expect(result.church.confession.adopted).toBe(adopted);
    // Grounded red flags continue to override even fully supported doctrine.
    expect(postProcessEvaluation(result).status).toBe("not_endorsed");
  });

  it("exports the production model and medium core thinking level", () => {
    expect(EVALUATION_MODEL).toBe("gemini-3.8-flash");
    expect(CORE_EXTRACTION_THINKING_LEVEL).toBe(ThinkingLevel.MEDIUM);
    expect(EVALUATION_PROMPT_VERSION).toBe("2026-10-31-affiliation");
  });

  it.each(["explicit", "mention", "failed_fetch"] as const)(
    "fetches a model-selected affiliation page before classification (%s)", async (scenario) => {
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const base = "https://ejemplo.iglesia/";
      // An opaque path deliberately provides no lexical clue about affiliation.
      const target = `${base}p/42`;
      const resolvedTarget = `${base}p/84`;
      const organization = "Comunión de Iglesias";
      const statement = "Nuestra iglesia forma parte de la Comunión de Iglesias.";
      const fetchedText = scenario === "mention" ? `Recursos: ${organization}` : statement;
      const affiliationBadge = "🤝 Denomination/Network Affiliated";
      const basic = {
        name: "Iglesia Ejemplo", website: base, addresses: [],
        contacts: { phone: null, email: null }, service_times: [],
        best_pages_for: { beliefs: null, confession: null, about: null, leadership: null },
        affiliation_pages: [target, target],
      };
      const responses = new Map<unknown, unknown>([
        [BASIC_FIELDS_SCHEMA, basic],
        [CORE_DOCTRINES_SCHEMA, { core_doctrines: unknownCore, notes: [] }],
        [SECONDARY_DOCTRINES_SCHEMA, {
          secondary: Object.fromEntries(["baptism", "governance", "lords_supper", "gifts", "sanctification", "continuity", "security", "atonement_model"].map(key => [key, null])),
          // A different parallel call cannot bypass the evidence gate.
          badges: [affiliationBadge],
        }],
        [TERTIARY_DOCTRINES_SCHEMA, { tertiary: {}, badges: [] }],
        [DENOMINATION_CONFESSION_SCHEMA, {
          denomination: { label: null, confidence: 0, signals: [] },
          confession: { adopted: false, name: null, source_url: null, affirmed_core_doctrines: [] },
          affiliations: [{
            organization,
            relationship: scenario === "mention" ? "resource_or_mention" : "current_affiliation",
            text: scenario === "mention" ? organization : statement,
            source_url: target,
          }],
          badges: [affiliationBadge],
          notes: [{ label: "Network Affiliation", text: organization, source_url: base }],
        }],
        [RED_FLAGS_SCHEMA, { badges: [], notes: [] }],
      ]);
      const events: string[] = [];
      const generateContent = vi.fn(async (request) => {
        events.push(request.config.responseSchema === BASIC_FIELDS_SCHEMA ? "discovery" : "classification");
        return { text: JSON.stringify(responses.get(request.config.responseSchema)) };
      });
      const extractPage = vi.fn(async () => {
        events.push("fetch");
        if (scenario === "failed_fetch") throw new Error("Upstream failed");
        return { requestedUrl: target, url: resolvedTarget, rawContent: fetchedText };
      });
      const result = await extractChurchEvaluation(base, {
        client: { models: { generateContent } } as unknown as GoogleGenAI,
        crawl: async () => ({ base_url: base, results: [{ url: base, rawContent: `[${organization}](${target})` }] }),
        extractPage,
      });

      expect(extractPage).toHaveBeenCalledExactlyOnceWith(target);
      expect(events).toEqual(["discovery", "fetch", ...Array(5).fill("classification")]);
      expect(result.church.affiliation_pages).toEqual([target]);
      expect(result.church.badges.includes(affiliationBadge)).toBe(scenario === "explicit");
      expect(result.church.notes).toEqual(scenario === "explicit" ? [{
        label: "Denomination Affiliation", text: statement, source_url: target,
      }] : []);
      if (scenario !== "failed_fetch") {
        expect(result.metadata?.source_pages).toContainEqual(expect.objectContaining({ requested_url: target, resolved_url: resolvedTarget }));
        const denominationRequest = generateContent.mock.calls.find(([request]) => request.config.responseSchema === DENOMINATION_CONFESSION_SCHEMA)?.[0];
        expect(denominationRequest.contents[0].parts[0].text).toContain(fetchedText);
      } else {
        expect(result.church.affiliations).toEqual([]);
        expect(result.metadata?.source_pages).toHaveLength(1);
      }
    },
  );
});
