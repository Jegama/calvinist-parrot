import { describe, expect, it } from "vitest";

import type {
  CoreDoctrinesResponse,
  CoreDoctrineMap,
  DenominationConfessionResponse,
  RedFlagsResponse,
} from "@/types/church";

import {
  applyConfessionCoreEvidence,
  validateCoreDoctrineEvidence,
  validateRedFlagEvidence,
} from "./evidence";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";
import { postProcessEvaluation } from "./post-process";
import type { ChurchEvaluationRaw } from "@/types/church";

const unknownCore = {
  trinity: "unknown",
  gospel: "unknown",
  justification_by_faith: "unknown",
  christ_deity_humanity: "unknown",
  scripture_authority: "unknown",
  incarnation_virgin_birth: "unknown",
  atonement_necessary_sufficient: "unknown",
  resurrection_of_jesus: "unknown",
  return_and_judgment: "unknown",
  character_of_god: "unknown",
} satisfies CoreDoctrineMap;

function response(
  overrides: Partial<CoreDoctrineMap>,
  notes: CoreDoctrinesResponse["notes"],
): CoreDoctrinesResponse {
  return {
    core_doctrines: { ...unknownCore, ...overrides },
    notes,
  };
}

describe("validateCoreDoctrineEvidence", () => {
  it("retains a status backed by a verbatim quote from its source page", () => {
    const result = validateCoreDoctrineEvidence(
      response(
        { scripture_authority: "true" },
        [{
          label: "scripture_authority",
          text: "The Bible is the inspired Word of God and our final authority.",
          source_url: "https://example.church/beliefs",
        }],
      ),
      [{
        url: "https://example.church/beliefs",
        rawContent:
          "We believe: The Bible is the inspired Word of God and our final authority.",
      }],
    );

    expect(result.core_doctrines.scripture_authority).toBe("true");
    expect(result.notes).toHaveLength(1);
  });

  it("accepts the requested URL when extraction followed a redirect", () => {
    const result = validateCoreDoctrineEvidence(
      response(
        { resurrection_of_jesus: "true" },
        [{
          label: "resurrection_of_jesus",
          text: "Jesus Christ arose from the dead.",
          source_url: "https://example.church/about",
        }],
      ),
      [{
        requestedUrl: "https://example.church/about",
        url: "https://example.church/leadership",
        rawContent: "Jesus Christ arose from the dead.",
      }],
    );

    expect(result.core_doctrines.resurrection_of_jesus).toBe("true");
  });

  it("retains source-grounded composite doctrine evidence in Spanish", () => {
    const quote =
      "Jesucristo es verdaderamente Dios y verdaderamente hombre.";
    const result = validateCoreDoctrineEvidence(
      response(
        { christ_deity_humanity: "true" },
        [{
          label: "christ_deity_humanity",
          text: quote,
          source_url: "https://ejemplo.iglesia/creemos",
        }],
      ),
      [{
        url: "https://ejemplo.iglesia/creemos",
        rawContent: `Nuestra confesión declara: ${quote}`,
      }],
    );

    expect(result.core_doctrines.christ_deity_humanity).toBe("true");
    expect(result.notes).toHaveLength(1);
  });

  it("downgrades a status with no matching note to unknown", () => {
    const result = validateCoreDoctrineEvidence(
      response({ trinity: "true" }, []),
      [],
    );

    expect(result.core_doctrines.trinity).toBe("unknown");
  });

  it("downgrades a hallucinated quotation to unknown", () => {
    const result = validateCoreDoctrineEvidence(
      response(
        { trinity: "true" },
        [{
          label: "trinity",
          text: "We believe in one God in three persons.",
          source_url: "https://example.church/beliefs",
        }],
      ),
      [{
        url: "https://example.church/beliefs",
        rawContent: "God loves you.",
      }],
    );

    expect(result.core_doctrines.trinity).toBe("unknown");
    expect(result.notes).toEqual([]);
  });

  it("rejects a citation to a URL outside the source set", () => {
    const result = validateCoreDoctrineEvidence(
      response(
        { gospel: "true" },
        [{
          label: "gospel",
          text: "Christ died and rose again for our salvation.",
          source_url: "https://invented.example/faith",
        }],
      ),
      [{
        url: "https://example.church/beliefs",
        rawContent: "Christ died and rose again for our salvation.",
      }],
    );

    expect(result.core_doctrines.gospel).toBe("unknown");
  });

  it("rejects evidence that exceeds the structural quote limit", () => {
    const quote = "D".repeat(501);
    const result = validateCoreDoctrineEvidence(
      response(
        { trinity: "true" },
        [{
          label: "trinity",
          text: quote,
          source_url: "https://example.church/beliefs",
        }],
      ),
      [{
        url: "https://example.church/beliefs",
        rawContent: quote,
      }],
    );

    expect(result.core_doctrines.trinity).toBe("unknown");
  });
});

describe("validateRedFlagEvidence", () => {
  it("retains grounded Spanish clergy and textual gender evidence", () => {
    const quote = "María López — Pastora. Ella dirige la congregación.";
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: quote,
        source_url: "https://ejemplo.iglesia/liderazgo",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://ejemplo.iglesia/liderazgo",
      rawContent: `Equipo pastoral: ${quote}`,
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
    expect(result.notes).toEqual(response.notes);
  });

  it("accepts a requested URL when a leadership page redirects", () => {
    const quote = "牧師の佐藤恵美。彼女は会衆を導いています。";
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "👩‍🏫 Ordained Women",
        text: quote,
        source_url: "https://example.jp/team",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      requestedUrl: "https://example.jp/team",
      url: "https://example.jp/leaders",
      rawContent: quote,
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
  });

  it("removes Ordained Women when its quotation is hallucinated", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "María López — Pastora. Ella dirige la congregación.",
        source_url: "https://ejemplo.iglesia/liderazgo",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://ejemplo.iglesia/liderazgo",
      rawContent: "María López — Directora del ministerio infantil.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("preserves unrelated red flags while removing unsupported Ordained Women", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women", "⚠️ Prosperity Gospel"],
      notes: [{
        label: "Ordained Women",
        text: "Unsupported quotation",
        source_url: "https://example.church/team",
      }, {
        label: "Prosperity Gospel",
        text: "Giving guarantees personal wealth.",
        source_url: "https://example.church/giving",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/giving",
      rawContent: "Giving guarantees personal wealth.",
    }]);

    expect(result.badges).toEqual(["⚠️ Prosperity Gospel"]);
    expect(result.notes).toEqual([response.notes[1]]);
  });
});

describe("applyConfessionCoreEvidence", () => {
  const sourceUrl = "https://example.church/beliefs";
  const quote = "Nuestra iglesia adopta la Confesión Bautista de Londres de 1689 como su norma doctrinal.";
  function confessionResponse(): DenominationConfessionResponse {
    return {
      denomination: { label: "Reformed Baptist", confidence: 1, signals: [] },
      confession: {
        adopted: true,
        name: "Second London Baptist Confession (1689)",
        source_url: sourceUrl,
        affirmed_core_doctrines: [...CORE_DOCTRINE_KEYS],
      },
      badges: [],
      notes: [{ label: "Adopted Confession", text: quote, source_url: sourceUrl }],
    };
  }

  it("accepts source-language adoption evidence and records only supplemented doctrines", () => {
    const response = confessionResponse();
    response.confession.source_url = `${sourceUrl}/redirected`;
    const result = applyConfessionCoreEvidence(
      { ...unknownCore, scripture_authority: "true" },
      response,
      [{ requestedUrl: sourceUrl, url: `${sourceUrl}/redirected`, rawContent: quote }],
    );
    expect(Object.values(result.coreDoctrines).every((value) => value === "true")).toBe(true);
    expect(result.inferredKeys).toHaveLength(9);
    expect(result.inferredKeys).not.toContain("scripture_authority");
    expect(result.notes[0].text).toBe(quote);
  });

  it.each([
    ["unadopted resource", { adopted: false }],
    ["unrecognized confession", { name: "A new confession" }],
    ["BFM 2000", { name: "Baptist Faith and Message (2000 Edition)" }],
    ["missing adoption URL", { source_url: null }],
    ["different adoption URL", { source_url: "https://example.church/elsewhere" }],
    ["legacy evaluation without semantic assessment", { affirmed_core_doctrines: undefined }],
    ["ambiguous qualified subscription", { affirmed_core_doctrines: [] }],
  ])("does not supplement core doctrines for %s", (_, overrides) => {
    const response = confessionResponse();
    Object.assign(response.confession, overrides);
    const result = applyConfessionCoreEvidence(unknownCore, response, [{ url: sourceUrl, rawContent: quote }]);
    expect(result.coreDoctrines).toEqual(unknownCore);
    expect(result.inferredKeys).toEqual([]);
  });

  it("rejects ungrounded adoption even when the model claims all doctrines", () => {
    const result = applyConfessionCoreEvidence(unknownCore, confessionResponse(), [{
      url: sourceUrl,
      rawContent: "A church website without that quotation.",
    }]);
    expect(result.confession.adopted).toBe(false);
    expect(result.inferredKeys).toEqual([]);
  });

  it("does not use an unrelated grounded note as adoption evidence", () => {
    const response = confessionResponse();
    response.notes[0].label = "Denomination Affiliation";
    const result = applyConfessionCoreEvidence(unknownCore, response, [{ url: sourceUrl, rawContent: quote }]);
    expect(result.confession.adopted).toBe(false);
    expect(result.inferredKeys).toEqual([]);
  });

  it("respects a semantic exception and never overwrites an explicit denial", () => {
    const response = confessionResponse();
    response.confession.affirmed_core_doctrines = CORE_DOCTRINE_KEYS.filter((key) => key !== "resurrection_of_jesus");
    const result = applyConfessionCoreEvidence(
      { ...unknownCore, trinity: "false" },
      response,
      [{ url: sourceUrl, rawContent: quote }],
    );
    expect(result.coreDoctrines.trinity).toBe("false");
    expect(result.coreDoctrines.resurrection_of_jesus).toBe("unknown");
    expect(result.coreDoctrines.gospel).toBe("true");
    expect(result.inferredKeys).toHaveLength(8);
  });

  it.each([
    {
      name: "Providence Church",
      url: "https://providencechurchkaty.org/beliefs",
      adoption: "Providence Church fully subscribes to the 1689 London Baptist Confession of Faith.",
      core: { ...unknownCore, scripture_authority: "true" } as CoreDoctrineMap,
      directCount: 1,
    },
    {
      name: "Christian Fellowship Church",
      url: "https://www.christianfc.org/our-confession-of-faith",
      adoption: "Our church adopts this confession as our official doctrinal standard, recognizing two levels of adherence.",
      core: Object.fromEntries(CORE_DOCTRINE_KEYS.map((key) => [
        key, key === "trinity" || key === "resurrection_of_jesus" ? "unknown" : "true",
      ])) as CoreDoctrineMap,
      directCount: 8,
    },
  ])("corrects the saved $name pattern without inflating direct coverage", ({ name, url, adoption, core, directCount }) => {
    const response = confessionResponse();
    response.confession.source_url = url;
    response.notes = [{ label: "Adopted Confession", text: adoption, source_url: url }];
    const resolved = applyConfessionCoreEvidence(core, response, [{ url, rawContent: adoption }]);
    const raw = {
      metadata: { confession_inferred_core: resolved.inferredKeys },
      church: {
        name,
        confession: resolved.confession,
        core_doctrines: resolved.coreDoctrines,
        notes: resolved.notes,
        badges: ["📜 Reformed", "⚠️ Low Essentials Coverage", "ℹ️ Minimal Doctrinal Detail"],
      },
    } as ChurchEvaluationRaw;
    const result = postProcessEvaluation(raw);
    expect(result.status).toBe("recommended");
    expect(result.coverageRatio).toBe(1);
    expect(result.coreOnSiteCount).toBe(directCount);
    expect(result.badges).not.toContain("⚠️ Low Essentials Coverage");
    expect(result.badges).not.toContain("ℹ️ Minimal Doctrinal Detail");

    raw.church.core_doctrines.trinity = "false";
    expect(postProcessEvaluation(raw).status).toBe("not_endorsed");
    raw.church.core_doctrines.trinity = "true";
    raw.church.badges.push("⚠️ Prosperity Gospel");
    expect(postProcessEvaluation(raw).status).toBe("not_endorsed");
  });
});
