import { describe, expect, it } from "vitest";

import type {
  CoreDoctrinesResponse,
  CoreDoctrineMap,
  RedFlagsResponse,
} from "@/types/church";

import {
  validateCoreDoctrineEvidence,
  validateRedFlagEvidence,
} from "./evidence";

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
