import { describe, expect, it } from "vitest";

import type { ChurchAffiliationEvidence, ChurchNote } from "@/types/church";
import { validateAffiliationEvidence } from "./evidence";

const badge = "🤝 Denomination/Network Affiliated";
const source = "https://example.church/relaciones";
const organization = "Comunión de Iglesias";
const statement = "Nuestra iglesia forma parte de la Comunión de Iglesias.";

function assessment(overrides: Partial<ChurchAffiliationEvidence> = {}): ChurchAffiliationEvidence {
  return { organization, relationship: "current_affiliation", text: statement, source_url: source, ...overrides };
}

describe("validateAffiliationEvidence", () => {
  it.each([
    [organization, statement],
    ["教会連合", "私たちの教会は教会連合に加盟しています。"],
    ["اتحاد الكنائس", "كنيستنا عضو في اتحاد الكنائس."],
  ])("retains source-grounded current affiliation in its original language (%s)", (organization, text) => {
    const affiliation = assessment({ organization, text });
    const unrelatedNote: ChurchNote = { label: "Adopted Confession", text: "A separate note.", source_url: source };
    const result = validateAffiliationEvidence({
      affiliations: [affiliation],
      badges: ["📜 Reformed", "🆓 Independent"],
      notes: [unrelatedNote],
    }, [{ requestedUrl: source, url: `${source}/redirected`, rawContent: text }]);

    expect(result.affiliations).toEqual([affiliation]);
    expect(result.badges).toEqual(["📜 Reformed", badge]);
    expect(result.notes).toEqual([unrelatedNote, {
      label: "Denomination Affiliation", text, source_url: source,
    }]);
  });

  it.each([
    ["resource_or_mention", organization],
    ["resource_or_mention", "Recomendamos los recursos de la Comunión de Iglesias."],
    ["past_affiliation", "Nuestra iglesia dejó la Comunión de Iglesias en 2020."],
    ["no_affiliation", "Nuestra iglesia no pertenece a la Comunión de Iglesias."],
    ["unclear", "Consideramos unirnos a la Comunión de Iglesias."],
  ] as const)("does not turn %s evidence into a badge even when the quote is grounded", (relationship, text) => {
    const affiliation = assessment({ relationship, text });
    const result = validateAffiliationEvidence({
      affiliations: [affiliation], badges: [badge, "📜 Reformed"],
      notes: [{ label: "Network Affiliation", text, source_url: source }],
    }, [{ url: source, rawContent: text }]);
    expect(result.affiliations).toEqual([affiliation]);
    expect(result.badges).toEqual(["📜 Reformed"]);
    expect(result.notes).toEqual([]);
  });

  it("rejects the original navigation-only pattern without a relationship assessment", () => {
    const result = validateAffiliationEvidence({
      badges: [badge], notes: [{ label: "Denomination Affiliation", text: organization, source_url: source }],
    }, [{ url: source, rawContent: organization }]);
    expect(result.badges).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it.each([
    { text: "A fabricated affiliation sentence." },
    { text: " " },
    { source_url: "https://unfetched.example/church" },
    { organization: " " },
  ])("rejects an ungrounded or incomplete current-affiliation claim (%j)", (overrides) => {
    const result = validateAffiliationEvidence({
      affiliations: [assessment(overrides)], badges: [badge], notes: [],
    }, [{ url: source, rawContent: statement }]);
    expect(result.affiliations).toEqual([]);
    expect(result.badges).toEqual([]);
  });

  it("keeps independently supported memberships when another candidate lacks evidence", () => {
    const result = validateAffiliationEvidence({
      affiliations: [assessment(), assessment({ organization: "Otra red", text: "An unsupported relationship." })],
      badges: [badge, badge], notes: [],
    }, [{ url: source, rawContent: statement }]);
    expect(result.affiliations).toEqual([assessment()]);
    expect(result.badges).toEqual([badge]);
    expect(result.notes).toHaveLength(1);
  });
});
