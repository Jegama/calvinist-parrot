import type {
  ChurchNote,
  ChurchAffiliationEvidence,
  CoreDoctrinesResponse,
  CoreDoctrineKey,
  CoreDoctrineMap,
  DenominationConfessionResponse,
  RedFlagsResponse,
} from "../../types/church";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";
import { HISTORIC_REFORMED_CONFESSIONS } from "./policy";

const MAX_EVIDENCE_QUOTE_CODE_POINTS = 500;

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
  note: Pick<ChurchNote, "source_url">,
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
  const evidence = note.text.trim();
  if (
    !evidence ||
    Array.from(evidence).length > MAX_EVIDENCE_QUOTE_CODE_POINTS
  ) {
    return false;
  }

  const sourcePage = findSourcePage(note, pages);
  if (!sourcePage?.rawContent) return false;

  return normalizeEvidenceText(sourcePage.rawContent)
    .includes(normalizeEvidenceText(evidence));
}

function normalizeCanonicalLabel(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ");
}

function noteMatchesBadge(note: ChurchNote, badge: string): boolean {
  return normalizeCanonicalLabel(note.label) === normalizeCanonicalLabel(badge);
}

export function filterGroundedNotes(
  notes: ChurchNote[],
  pages: EvidenceSourcePage[],
): ChurchNote[] {
  return notes.filter((note) => isGroundedNote(note, pages));
}

const AFFILIATION_BADGE = "🤝 Denomination/Network Affiliated";
const INDEPENDENT_BADGE = "🆓 Independent";

function isAffiliationNote(note: ChurchNote): boolean {
  return ["denomination affiliation", "network affiliation", "denomination/network affiliation", "denomination/network affiliated"]
    .includes(normalizeCanonicalLabel(note.label));
}

/**
 * Semantic relationship assessment belongs to the multilingual extraction
 * prompt. Code verifies quotation grounding and gates the badge across all
 * parallel calls; a legacy badge or a navigation quotation alone is insufficient.
 */
export function validateAffiliationEvidence(
  response: {
    affiliations?: ChurchAffiliationEvidence[];
    badges: string[];
    notes: ChurchNote[];
  },
  pages: EvidenceSourcePage[],
) {
  const affiliations = (response.affiliations ?? []).filter((affiliation) =>
    affiliation.organization.trim().length > 0 &&
    isGroundedNote({ ...affiliation, label: "Denomination Affiliation" }, pages)
  );
  const currentAffiliations = affiliations.filter(
    (affiliation) => affiliation.relationship === "current_affiliation",
  );
  const hasAffiliation = currentAffiliations.length > 0;
  const badges = response.badges.filter((badge) =>
    badge !== AFFILIATION_BADGE && !(hasAffiliation && badge === INDEPENDENT_BADGE)
  );
  if (hasAffiliation) badges.push(AFFILIATION_BADGE);

  return {
    affiliations,
    badges: [...new Set(badges)],
    notes: [
      ...response.notes.filter((note) => !isAffiliationNote(note)),
      ...currentAffiliations.map((affiliation) => ({
        label: "Denomination Affiliation",
        text: affiliation.text,
        source_url: affiliation.source_url,
      })),
    ],
  };
}

/**
 * The multilingual model assesses subscription and its exceptions. Code checks
 * the canonical confession, cited adoption quotation, and requested doctrine
 * keys before supplementing unknowns. Direct evidence (including denials) wins.
 */
export function applyConfessionCoreEvidence(
  core: CoreDoctrineMap,
  response: DenominationConfessionResponse,
  pages: EvidenceSourcePage[],
) {
  const notes = filterGroundedNotes(response.notes, pages);
  const confessionPage = findSourcePage(response.confession, pages);
  const hasGroundedAdoption = Boolean(confessionPage) && notes.some((note) =>
    normalizeCanonicalLabel(note.label) === "adopted confession" &&
    findSourcePage(note, pages) === confessionPage
  );
  const recognizedConfession = HISTORIC_REFORMED_CONFESSIONS.some(
    (name) => name === response.confession.name,
  );
  const adopted = response.confession.adopted && recognizedConfession && hasGroundedAdoption;
  const assessedKeys = response.confession.affirmed_core_doctrines;
  const affirmed = adopted && Array.isArray(assessedKeys)
    ? CORE_DOCTRINE_KEYS.filter((key) => assessedKeys.includes(key))
    : [];
  const inferredKeys = affirmed.filter((key) => core[key] === "unknown");
  const coreDoctrines = { ...core };
  for (const key of inferredKeys) coreDoctrines[key] = "true";

  return {
    coreDoctrines,
    inferredKeys,
    confession: {
      ...response.confession,
      adopted,
      affirmed_core_doctrines: affirmed,
    },
    notes: notes.filter((note) =>
      adopted || normalizeCanonicalLabel(note.label) !== "adopted confession"
    ),
  };
}

/**
 * Fail closed when an LLM returns a doctrine status without a short,
 * source-grounded quotation. Semantic completeness is handled by the
 * structured multilingual extraction prompt rather than a language allowlist.
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

    acc[key] = matchingGroundedNotes.length > 0 ? status : "unknown";
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
 * Keep deterministic red-flag validation structural and language-neutral.
 * The extraction prompt owns badge semantics; code only requires each badge to
 * have a matching short quotation grounded in the cited source.
 */
export function validateRedFlagEvidence(
  response: RedFlagsResponse,
  pages: EvidenceSourcePage[],
): RedFlagsResponse {
  const groundedNotes = filterGroundedNotes(response.notes, pages);
  const groundedBadges = response.badges.filter((badge) =>
    groundedNotes.some((note) => noteMatchesBadge(note, badge))
  );

  return {
    badges: groundedBadges,
    notes: groundedNotes.filter((note) =>
      groundedBadges.some((badge) => noteMatchesBadge(note, badge))
    ),
  };
}
