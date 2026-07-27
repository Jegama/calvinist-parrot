import type {
  ChurchNote,
  CoreDoctrinesResponse,
  CoreDoctrineKey,
  CoreDoctrineMap,
  RedFlagsResponse,
} from "../../types/church";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";

const ORDAINED_WOMEN_BADGE = "👩‍🏫 Ordained Women";

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
  const nameToken =
    String.raw`(?:[A-Z]\.|[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*[A-Za-zÀ-ÖØ-öø-ÿ'’])`;
  const personName = String.raw`${nameToken}(?:\s+${nameToken}){1,3}`;
  const clergyOffice =
    String.raw`(?:[Pp]astor|PASTOR|[Ee]lder|ELDER|[Rr]ev(?:erend)?\.?|REV(?:EREND)?\.?|[Bb]ishop|BISHOP|[Pp]riest|PRIEST)`;
  const officeModifier =
    String.raw`(?:[Ll]ead|[Tt]eaching|[Aa]ssociate|[Ee]xecutive|[Ss]enior|[Cc]ampus|[Ww]orship|[Cc]hildren(?:'s|’s)?|[Yy]outh|[Ff]amily|[Dd]iscipleship|[Mm]issions?)`;
  const titledOffice = String.raw`(?:${officeModifier}\s+)*${clergyOffice}`;

  const officeBeforeName = new RegExp(
    String.raw`(?:^|[\s.,;:—–-])${titledOffice}\s+(${personName})(?:$|[\s.,;:—–-])`,
  );
  const nameBeforeOffice = new RegExp(
    String.raw`(?:^|[\s.,;:—–-])(${personName})\s*(?:,|:|—|–|-)\s*${titledOffice}(?:$|[\s.,;:—–-])`,
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
  const statedPronouns = /\(\s*she\s*\/\s*(?:her|hers)\s*\)/i;
  const connectedFemalePronoun =
    /(?:^|[.!?]\s+|[,;:—–-]\s+)(?:she|her)\b/i;
  const explicitFemaleDescription = new RegExp(
    String.raw`\b${escapedName}\s+(?:is|identifies as)\s+(?:a\s+)?(?:woman|female)\b`,
    "i",
  );

  return genderedHonorific.test(value) ||
    statedPronouns.test(value) ||
    connectedFemalePronoun.test(value) ||
    explicitFemaleDescription.test(value);
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
 * quotation. This validates provenance, not theological sufficiency; the core
 * doctrine prompt remains responsible for requiring every component of a
 * composite doctrine.
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

    const hasGroundedEvidence = groundedNotes.some(
      (note) => normalizeDoctrineLabel(note.label) === key,
    );

    acc[key] = hasGroundedEvidence ? status : "unknown";
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
