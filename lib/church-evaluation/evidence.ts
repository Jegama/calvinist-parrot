import type {
  ChurchNote,
  CoreDoctrinesResponse,
  CoreDoctrineKey,
  CoreDoctrineMap,
  RedFlagsResponse,
} from "../../types/church";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";

const ORDAINED_WOMEN_BADGE = "👩‍🏫 Ordained Women";
const NAME_TOKEN =
  String.raw`(?:[A-Z]\.|[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*[A-Za-zÀ-ÖØ-öø-ÿ'’])`;
const PERSON_NAME = String.raw`${NAME_TOKEN}(?:\s+${NAME_TOKEN}){1,3}`;
const CLERGY_OFFICE =
  String.raw`(?:[Pp]astor|PASTOR|[Ee]lder|ELDER|[Rr]ev(?:erend)?\.?|REV(?:EREND)?\.?|[Bb]ishop|BISHOP|[Pp]riest|PRIEST)`;
const OFFICE_MODIFIER =
  String.raw`(?:[Ll]ead|[Tt]eaching|[Aa]ssociate|[Ee]xecutive|[Ss]enior|[Cc]ampus|[Ww]orship|[Cc]hildren(?:'s|’s)?|[Yy]outh|[Ff]amily|[Dd]iscipleship|[Mm]issions?)`;
const TITLED_OFFICE = String.raw`(?:${OFFICE_MODIFIER}\s+)*${CLERGY_OFFICE}`;
const STATED_FEMALE_PRONOUNS = String.raw`\(\s*she\s*\/\s*(?:her|hers)\s*\)`;

const REQUIRED_TRUE_COMPONENTS: Partial<
  Record<CoreDoctrineKey, readonly (readonly RegExp[])[]>
> = {
  gospel: [
    [
      /\b(?:christ|jesus|he)(?:'s)?\b.{0,50}\b(?:died|death|cross|shed his blood)\b/i,
      /\bchrist's (?:saving |sacrificial |atoning )?death\b/i,
    ],
    [/\b(?:rose|risen|resurrection|raised) from the dead\b/i, /\bbodily resurrection\b/i],
    [
      /\b(?:saved|salvation|justified)\b.{0,50}\b(?:grace\b.{0,50}\bfaith|faith\b.{0,50}\bgrace)\b/i,
      /\bfaith alone\b/i,
      /\bby grace through faith\b/i,
    ],
  ],
  christ_deity_humanity: [
    [
      /\bjesus(?: christ)? is (?:fully |truly |eternally )?god\b/i,
      /\b(?:fully|truly|eternally) god\b/i,
      /\bgod incarnate\b/i,
      /\bdivine nature\b/i,
    ],
    [
      /\b(?:fully|truly|really) (?:man|human)\b/i,
      /\bhuman nature\b/i,
      /\b(?:god|the word) became (?:man|flesh)\b/i,
      /\btook (?:on|upon himself) (?:a )?human nature\b/i,
    ],
  ],
  incarnation_virgin_birth: [
    [
      /\bincarnat(?:e|ed|ion)\b/i,
      /\b(?:god|the word) became (?:man|flesh)\b/i,
      /\btook (?:on|upon himself) (?:a )?human nature\b/i,
    ],
    [
      /\bvirgin birth\b/i,
      /\bborn (?:of|to) (?:the )?virgin mary\b/i,
      /\bconceived by (?:the )?holy spirit\b/i,
    ],
  ],
  atonement_necessary_sufficient: [
    [
      /\b(?:christ|jesus|he)(?:'s)?\b.{0,50}\b(?:died|death|cross|aton\w*|sacrific\w*|blood|propitiat\w*|ransom\w*|reconcil\w*)\b/i,
      /\b(?:atoning|substitutionary) sacrifice\b/i,
    ],
    [
      /\b(?:only|sole|unique)\b.{0,40}\b(?:way|means|mediator|savior|salvation|atonement|sacrifice)\b/i,
      /\b(?:sufficient|once for all|fully paid)\b/i,
      /\bnecessary and sufficient\b/i,
    ],
  ],
  return_and_judgment: [
    [
      /\b(?:christ|jesus|he)\b.{0,30}\b(?:will|shall) (?:return|come again)\b/i,
      /\bsecond coming\b/i,
    ],
    [/\b(?:judge|judgment|judgement)\b/i],
  ],
  character_of_god: [
    [/\b(?:holy|just|righteous|wrath|judge|judgment|judgement)\b/i],
    [/\b(?:good|loving|love|merciful|mercy|gracious|grace|faithful)\b/i],
  ],
};

export type EvidenceSourcePage = {
  url?: string;
  requestedUrl?: string;
  rawContent?: string;
};

function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "") || null;
  }
}

function normalizeDoctrineLabel(value: string): CoreDoctrineKey | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return CORE_DOCTRINE_KEYS.includes(normalized as CoreDoctrineKey)
    ? normalized as CoreDoctrineKey
    : null;
}

function findSourcePage(
  note: ChurchNote,
  pages: EvidenceSourcePage[],
): EvidenceSourcePage | null {
  const noteUrl = normalizeSourceUrl(note.source_url);
  if (!noteUrl) return null;

  return pages.find((page) => {
    const resolvedUrl = normalizeSourceUrl(page.url);
    const requestedUrl = normalizeSourceUrl(page.requestedUrl);
    return noteUrl === resolvedUrl || noteUrl === requestedUrl;
  }) ?? null;
}

function isGroundedNote(
  note: ChurchNote,
  pages: EvidenceSourcePage[],
): boolean {
  if (!note.text.trim()) return false;

  const sourcePage = findSourcePage(note, pages);
  if (!sourcePage?.rawContent) return false;

  return normalizeEvidenceText(sourcePage.rawContent)
    .includes(normalizeEvidenceText(note.text));
}

function extractQuotedEvidence(value: string): string[] {
  return [...value.matchAll(/["“]([^"”]+)["”]/g)]
    .map((match) => match[1]?.trim())
    .filter((quote): quote is string => Boolean(quote));
}

function extractExplicitNamedClergyName(value: string): string | null {
  const officeBeforeName = new RegExp(
    String.raw`(?:^|[\s.,;:—–-])${TITLED_OFFICE}\s+(${PERSON_NAME})(?:\s*${STATED_FEMALE_PRONOUNS})?(?:$|[\s.,;:—–-])`,
  );
  const nameBeforeOffice = new RegExp(
    String.raw`(?:^|[\s.,;:—–-])(${PERSON_NAME})(?:\s*${STATED_FEMALE_PRONOUNS})?\s*(?:,|:|—|–|-)\s*${TITLED_OFFICE}(?:$|[\s.,;:—–-])`,
  );

  return officeBeforeName.exec(value)?.[1] ??
    nameBeforeOffice.exec(value)?.[1] ??
    null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExplicitFemaleIdentity(
  value: string,
  personName: string,
): boolean {
  const escapedName = escapeRegExp(personName);
  const genderedHonorific = new RegExp(
    String.raw`(?:^|[\s,;:—–-])(?:Ms|Mrs|Miss)\.?\s+${escapedName}(?:$|[\s.,;:—–-])`,
    "i",
  );
  const statedPronouns = new RegExp(
    String.raw`(?:${escapedName}\s*${STATED_FEMALE_PRONOUNS}|${STATED_FEMALE_PRONOUNS}\s*${escapedName})`,
    "i",
  );
  const connectedFemalePronoun = new RegExp(
    String.raw`(?:${escapedName}(?:\s*${STATED_FEMALE_PRONOUNS})?\s*(?:,|:|—|–|-)\s*${TITLED_OFFICE}|${TITLED_OFFICE}\s+${escapedName}(?:\s*${STATED_FEMALE_PRONOUNS})?)\s*[.!?]\s*(?:she|her)\b`,
    "i",
  );
  const explicitFemaleDescription = new RegExp(
    String.raw`\b${escapedName}\s+(?:is|identifies as)\s+(?:a\s+)?(?:woman|female)\b`,
    "i",
  );

  return genderedHonorific.test(value) ||
    statedPronouns.test(value) ||
    connectedFemalePronoun.test(value) ||
    explicitFemaleDescription.test(value);
}

function hasCompleteCompositeEvidence(
  key: CoreDoctrineKey,
  notes: ChurchNote[],
): boolean {
  const requiredComponents = REQUIRED_TRUE_COMPONENTS[key];
  if (!requiredComponents) return true;

  const evidenceText = notes.map((note) => note.text).join(" ");
  return requiredComponents.every((patterns) =>
    patterns.some((pattern) => pattern.test(evidenceText))
  );
}

function isOrdainedWomenNote(note: ChurchNote): boolean {
  return normalizeEvidenceText(note.label).includes("ordained women");
}

function isGroundedOrdainedWomenNote(
  note: ChurchNote,
  pages: EvidenceSourcePage[],
): boolean {
  const sourcePage = findSourcePage(note, pages);
  if (!sourcePage?.rawContent) return false;

  const normalizedSource = normalizeEvidenceText(sourcePage.rawContent);
  return extractQuotedEvidence(note.text).some((quote) => {
    const personName = extractExplicitNamedClergyName(quote);
    return personName !== null &&
      hasExplicitFemaleIdentity(quote, personName) &&
      normalizedSource.includes(normalizeEvidenceText(quote));
  });
}

/**
 * Fail closed when an LLM returns a doctrine status without a source-grounded
 * quotation. Positive composite doctrines must also contain grounded evidence
 * for every component; a partial affirmation is downgraded to unknown.
 */
export function validateCoreDoctrineEvidence(
  response: CoreDoctrinesResponse,
  pages: EvidenceSourcePage[],
): CoreDoctrinesResponse {
  const groundedNotes = response.notes.filter((note) => {
    const label = normalizeDoctrineLabel(note.label);
    return label !== null && isGroundedNote(note, pages);
  });

  const normalizedCore = CORE_DOCTRINE_KEYS.reduce((acc, key) => {
    const status = response.core_doctrines[key];
    if (status === "unknown") {
      acc[key] = "unknown";
      return acc;
    }

    const matchingGroundedNotes = groundedNotes.filter(
      (note) => normalizeDoctrineLabel(note.label) === key,
    );

    const hasSufficientEvidence = matchingGroundedNotes.length > 0 &&
      (
        status !== "true" ||
        hasCompleteCompositeEvidence(key, matchingGroundedNotes)
      );

    acc[key] = hasSufficientEvidence ? status : "unknown";
    return acc;
  }, {} as CoreDoctrineMap);

  return {
    core_doctrines: normalizedCore,
    notes: groundedNotes.filter((note) => {
      const label = normalizeDoctrineLabel(note.label);
      return label !== null && normalizedCore[label] !== "unknown";
    }),
  };
}

/**
 * A generic leadership heading, a couple listing, or language about elders
 * serving alongside their wives does not establish that a woman holds an
 * ordained office. Keep this critical badge only when a single verbatim,
 * source-grounded quotation directly joins a named individual to a clergy
 * title and explicitly identifies that officeholder as a woman.
 */
export function validateRedFlagEvidence(
  response: RedFlagsResponse,
  pages: EvidenceSourcePage[],
): RedFlagsResponse {
  if (!response.badges.includes(ORDAINED_WOMEN_BADGE)) {
    return response;
  }

  const validOrdainedWomenNotes = response.notes.filter(
    (note) =>
      isOrdainedWomenNote(note) &&
      isGroundedOrdainedWomenNote(note, pages),
  );

  if (validOrdainedWomenNotes.length === 0) {
    return {
      badges: response.badges.filter((badge) => badge !== ORDAINED_WOMEN_BADGE),
      notes: response.notes.filter((note) => !isOrdainedWomenNote(note)),
    };
  }

  return {
    badges: response.badges,
    notes: [
      ...response.notes.filter((note) => !isOrdainedWomenNote(note)),
      ...validOrdainedWomenNotes,
    ],
  };
}
