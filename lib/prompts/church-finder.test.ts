import { describe, expect, it } from "vitest";

import {
  BASIC_FIELDS_PROMPT,
  CORE_DOCTRINES_PROMPT,
  DENOMINATION_CONFESSION_PROMPT,
  RED_FLAGS_PROMPT,
  SECONDARY_DOCTRINES_PROMPT,
  TERTIARY_DOCTRINES_PROMPT,
} from "./church-finder";

const extractionPrompts = [
  BASIC_FIELDS_PROMPT,
  CORE_DOCTRINES_PROMPT,
  SECONDARY_DOCTRINES_PROMPT,
  TERTIARY_DOCTRINES_PROMPT,
  DENOMINATION_CONFESSION_PROMPT,
  RED_FLAGS_PROMPT,
];

describe("church finder multilingual prompt contract", () => {
  it("applies source-language semantics and original quotations to every call", () => {
    for (const prompt of extractionPrompts) {
      expect(prompt).toContain(
        "Analyze official church content semantically in whatever language it is written.",
      );
      expect(prompt).toContain(
        "required canonical English form even when the source content is not English",
      );
      expect(prompt).toContain(
        "Preserve evidence quotations exactly in their original source language.",
      );
      expect(prompt).toContain(
        "not an explanation, translation, or paraphrase",
      );
    }
  });

  it("requires complete semantic evidence for composite core doctrines", () => {
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "ordinary semantic meaning establishes EVERY required component",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "If only part of a composite doctrine is stated, return `\"unknown\"`.",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "return multiple notes with the same doctrine label",
    );
  });

  it("uses language-neutral semantic entailment", () => {
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "Explicit evidence does not require a canonical technical term.",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "Apply the same ordinary meanings in every source language and never scan for these words.",
    );
  });

  it("allows rich evidence to support each doctrine it actually establishes", () => {
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "A single rich statement or passage may support multiple doctrine labels",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "Real humanity may be stated through concrete realities clearly predicated of the same Christ",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "semantically affirms this doctrine even if it does not use a technical term equivalent to \"justification.\"",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "semantically supports the gospel, justification by faith, Christ's deity and humanity, incarnation and virgin birth, atonement, and resurrection",
    );
  });

  it("keeps sparse evidence fail-closed", () => {
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "Sparse evidence remains unknown",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "do not automatically establish salvation by grace through faith, Christ's deity and real humanity, final judgment, or the necessity and sufficiency of His atonement",
    );
    expect(CORE_DOCTRINES_PROMPT).toContain(
      "a Bible citation by itself, denominational reputation, institutional affiliation, a person's education, absence of a denial, or a merely possible implication",
    );
  });

  it("keeps same-person clergy and textual-gender safeguards in the model contract", () => {
    expect(RED_FLAGS_PROMPT).toContain(
      "the same specifically named person is explicitly connected to both",
    );
    expect(RED_FLAGS_PROMPT).toContain(
      "source-language gendered title or honorific, pronoun, grammatical gender signal",
    );
    expect(RED_FLAGS_PROMPT).toContain(
      "Do not infer gender from a first name or photograph.",
    );
    expect(RED_FLAGS_PROMPT).toContain(
      "couple listing, generic leadership heading, wife relationship, or non-clergy role",
    );
    expect(RED_FLAGS_PROMPT).toContain(
      "the one exact original-language quotation must connect the same named person",
    );
  });

  it("requires groundable quotations instead of synthesized note explanations", () => {
    expect(DENOMINATION_CONFESSION_PROMPT).toContain(
      "One short verbatim original-language quotation that explicitly shows adoption",
    );
    expect(RED_FLAGS_PROMPT).toContain(
      "do not add explanatory framing",
    );
    expect(RED_FLAGS_PROMPT).not.toContain(
      "`text`: Brief explanation of what you found",
    );
  });
});
