import { describe, expect, it } from "vitest";

import type {
  CoreDoctrinesResponse,
  CoreDoctrineKey,
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

  it("downgrades a composite doctrine when only Christ's deity is grounded", () => {
    const result = validateCoreDoctrineEvidence(
      response(
        { christ_deity_humanity: "true" },
        [{
          label: "christ_deity_humanity",
          text: "Jesus Christ is truly God.",
          source_url: "https://example.church/beliefs",
        }],
      ),
      [{
        url: "https://example.church/beliefs",
        rawContent: "Jesus Christ is truly God.",
      }],
    );

    expect(result.core_doctrines.christ_deity_humanity).toBe("unknown");
    expect(result.notes).toEqual([]);
  });

  it("combines grounded notes to validate every component of a composite doctrine", () => {
    const notes = [{
      label: "christ_deity_humanity",
      text: "Jesus Christ is truly God.",
      source_url: "https://example.church/beliefs",
    }, {
      label: "christ_deity_humanity",
      text: "He took upon Himself a human nature.",
      source_url: "https://example.church/beliefs",
    }];
    const result = validateCoreDoctrineEvidence(
      response({ christ_deity_humanity: "true" }, notes),
      [{
        url: "https://example.church/beliefs",
        rawContent: "Jesus Christ is truly God. He took upon Himself a human nature.",
      }],
    );

    expect(result.core_doctrines.christ_deity_humanity).toBe("true");
    expect(result.notes).toEqual(notes);
  });

  it.each([
    [
      "gospel",
      "Christ died for our sins and rose from the dead.",
      "Salvation is by grace through faith.",
    ],
    [
      "incarnation_virgin_birth",
      "The Word became flesh.",
      "He was conceived by the Holy Spirit and born of the Virgin Mary.",
    ],
    [
      "atonement_necessary_sufficient",
      "Christ died as an atoning sacrifice for our sins.",
      "His death is necessary and sufficient.",
    ],
    [
      "return_and_judgment",
      "Jesus will return.",
      "He will judge the living and the dead.",
    ],
    [
      "character_of_god",
      "God is holy and just.",
      "God is good and merciful.",
    ],
  ] satisfies Array<[CoreDoctrineKey, string, string]>)(
    "requires both grounded components for %s",
    (key, firstComponent, secondComponent) => {
      const sourceUrl = "https://example.church/beliefs";
      const partial = validateCoreDoctrineEvidence(
        response(
          { [key]: "true" },
          [{ label: key, text: firstComponent, source_url: sourceUrl }],
        ),
        [{ url: sourceUrl, rawContent: firstComponent }],
      );
      const completeNotes = [
        { label: key, text: firstComponent, source_url: sourceUrl },
        { label: key, text: secondComponent, source_url: sourceUrl },
      ];
      const complete = validateCoreDoctrineEvidence(
        response({ [key]: "true" }, completeNotes),
        [{
          url: sourceUrl,
          rawContent: `${firstComponent} ${secondComponent}`,
        }],
      );

      expect(partial.core_doctrines[key]).toBe("unknown");
      expect(complete.core_doctrines[key]).toBe("true");
    },
  );
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
        text: "The leadership page identifies \"Sarah Johnson — Teaching Pastor. She oversees adult discipleship.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Our team includes Sarah Johnson — Teaching Pastor. She oversees adult discipleship.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
    expect(result.notes).toEqual(response.notes);
  });

  it("accepts a clergy title placed before the woman's name", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "👩‍🏫 Ordained Women",
        text: "The leadership page identifies \"Rev. Jane Doe. She serves on the pastoral team.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Rev. Jane Doe. She serves on the pastoral team.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
  });

  it("accepts a grounded gendered honorific tied to the named clergy member", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"Ms. Anna Lee — Associate Pastor\".",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Ms. Anna Lee — Associate Pastor.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
  });

  it("rejects a grounded male clergy title mislabeled as Ordained Women", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"John Smith — Pastor. He leads the congregation.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "John Smith — Pastor. He leads the congregation.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("does not infer female identity from a name alone", () => {
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
      rawContent: "Sarah Johnson — Teaching Pastor.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("does not apply another person's pronoun to a named male pastor", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"John Smith — Pastor; Jane coordinates outreach. She leads the women's ministry.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "John Smith — Pastor; Jane coordinates outreach. She leads the women's ministry.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("does not apply another person's stated pronouns to a named male pastor", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"John Smith — Pastor; Jane Doe (she/her) coordinates outreach.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "John Smith — Pastor; Jane Doe (she/her) coordinates outreach.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("accepts stated pronouns only when attached to the named clergy member", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"Sarah Johnson (she/her) — Teaching Pastor\".",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Sarah Johnson (she/her) — Teaching Pastor.",
    }]);

    expect(result.badges).toEqual(["👩‍🏫 Ordained Women"]);
  });

  it("rejects an explicit title that cannot be found on the cited page", () => {
    const response: RedFlagsResponse = {
      badges: ["👩‍🏫 Ordained Women"],
      notes: [{
        label: "Ordained Women",
        text: "The leadership page identifies \"Sarah Johnson — Teaching Pastor. She oversees adult discipleship.\"",
        source_url: "https://example.church/leadership",
      }],
    };

    const result = validateRedFlagEvidence(response, [{
      url: "https://example.church/leadership",
      rawContent: "Sarah Johnson — Children's Ministry Director. She oversees adult discipleship.",
    }]);

    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });
});
