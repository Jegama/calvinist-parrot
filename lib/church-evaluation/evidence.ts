import type {
  ChurchNote,
  CoreDoctrinesResponse,
  CoreDoctrineKey,
  CoreDoctrineMap,
  RedFlagsResponse,
} from "../../types/church";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";

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
