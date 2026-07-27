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
        rawContent: "We believe: The Bible is the inspired Word of God and our final authority.",
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
});

describe("validateRedFlagEvidence", () => {
  it("rejects the Refuge couple-list inference for Ordained Women", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The church leadership page lists \"ELDERS/PASTORS\" and explicitly includes \"Courtney & Marilyn Knerr\" and other couples in this governing category. Marilyn is also described as serving together with Courtney.",
        source_url: "https://www.myrefugecommunity.org/about",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://www.myrefugecommunity.org/about",
      rawContent: "ELDERS/PASTORS Courtney & Marilyn Knerr. The Elders/Pastors serve together alongside their wives.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("retains Ordained Women only for a grounded named clergy title", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"Sarah Johnson — Teaching Pastor\".",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Our team includes Sarah Johnson — Teaching Pastor.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
    expect(result.notes).toEqual(response.notes);
  });

  it("accepts a clergy title placed before the woman's name", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "👩‍🏫 Ordained Women",
        text: "The leadership page identifies \"Rev. Jane Doe\".",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Rev. Jane Doe serves on the pastoral team.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
  });

  it("rejects an explicit title that cannot be found on the cited page", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"Sarah Johnson — Teaching Pastor\".",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Sarah Johnson — Children's Ministry Director.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });
});
