import type { Prisma } from "@prisma/client";

import type {
  ChurchDetail,
  ChurchEvaluationRaw,
  ChurchEvaluationRecord,
  ChurchListItem,
  CoreDoctrineMap,
  CoreDoctrineStatusValue,
  EvaluationStatus,
} from "@/types/church";
import { CORE_DOCTRINE_KEYS } from "@/utils/churchEvaluation";

type ChurchWithRelations = Prisma.ChurchGetPayload<{
  include: {
    addresses: true;
    serviceTimes: true;
    evaluations: { orderBy: { createdAt: "desc" }; take: number };
  };
}>;

function mapDoctrineValue(value: string): CoreDoctrineStatusValue {
  if (value === "TRUE") return "true";
  if (value === "FALSE") return "false";
  return "unknown";
}

function mapEvaluationStatus(value: string): EvaluationStatus {
  if (value === "PASS") return "pass";
  if (value === "CAUTION") return "caution";
  return "red_flag";
}

function parseRawEvaluation(raw: Prisma.JsonValue): ChurchEvaluationRaw | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ChurchEvaluationRaw;
}

function toCoreDoctrineMap(evaluation: Prisma.ChurchEvaluation): CoreDoctrineMap {
  const entries: Array<[string, CoreDoctrineStatusValue]> = [
    ["trinity", mapDoctrineValue(evaluation.coreTrinity)],
    ["gospel", mapDoctrineValue(evaluation.coreGospel)],
    ["justification_by_faith", mapDoctrineValue(evaluation.coreJustificationByFaith)],
    ["christ_deity_humanity", mapDoctrineValue(evaluation.coreChristDeityHumanity)],
    ["scripture_authority", mapDoctrineValue(evaluation.coreScriptureAuthority)],
    ["incarnation_virgin_birth", mapDoctrineValue(evaluation.coreIncarnationVirginBirth)],
    ["atonement_necessary_sufficient", mapDoctrineValue(evaluation.coreAtonementNecessary)],
    ["resurrection_of_jesus", mapDoctrineValue(evaluation.coreResurrectionOfJesus)],
    ["return_and_judgment", mapDoctrineValue(evaluation.coreReturnAndJudgment)],
    ["character_of_god", mapDoctrineValue(evaluation.coreCharacterOfGod)],
  ];

  return Object.fromEntries(entries) as CoreDoctrineMap;
}

export function toEvaluationRecord(
  evaluation: Prisma.ChurchEvaluation | null | undefined
): ChurchEvaluationRecord | null {
  if (!evaluation) return null;
  const raw = parseRawEvaluation(evaluation.rawEvaluation);
  if (!raw) return null;

  return {
    id: evaluation.id,
    status: mapEvaluationStatus(evaluation.status),
    badges: evaluation.badges ?? [],
    coverageRatio: evaluation.coverageRatio,
    coreOnSiteCount: evaluation.coreOnSiteCount,
    coreTotalCount: evaluation.coreTotalCount,
    coreDoctrines: toCoreDoctrineMap(evaluation),
    secondary: (raw.church?.secondary as ChurchEvaluationRaw["church"]["secondary"]) ?? null,
    tertiary: (raw.church?.tertiary as ChurchEvaluationRaw["church"]["tertiary"]) ?? null,
    raw,
    createdAt: evaluation.createdAt.toISOString(),
  };
}

export function mapChurchToListItem(church: ChurchWithRelations): ChurchListItem {
  const latestEvaluation = church.evaluations[0];
  const primaryAddress =
    church.addresses.find((address) => address.isPrimary) ?? church.addresses[0] ?? null;

  return {
    id: church.id,
    name: church.name,
    website: church.website,
    city: primaryAddress?.city ?? null,
    state: primaryAddress?.state ?? null,
    latitude: primaryAddress?.latitude ?? null,
    longitude: primaryAddress?.longitude ?? null,
    confessionAdopted: church.confessionAdopted,
    denomination: {
      label: church.denominationLabel ?? null,
      confidence: church.denominationConfidence ?? null,
      signals: church.denominationSignals ?? [],
    },
    status: latestEvaluation ? mapEvaluationStatus(latestEvaluation.status) : null,
    coverageRatio: latestEvaluation?.coverageRatio ?? null,
    badges: latestEvaluation?.badges ?? [],
    serviceTimes: church.serviceTimes.map((service) => ({ id: service.id, label: service.label })),
  };
}

export function mapChurchToDetail(church: ChurchWithRelations): ChurchDetail {
  const listItem = mapChurchToListItem(church);
  const latestEvaluation = toEvaluationRecord(church.evaluations[0]);

  return {
    ...listItem,
    email: church.email ?? null,
    phone: church.phone ?? null,
    addresses: church.addresses.map((address) => ({
      id: address.id,
      street1: address.street1 ?? null,
      street2: address.street2 ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      postCode: address.postCode ?? null,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      sourceUrl: address.sourceUrl ?? null,
      isPrimary: address.isPrimary,
    })),
    bestPages: {
      beliefs: church.bestBeliefsUrl ?? null,
      confession: church.bestConfessionUrl ?? null,
      about: church.bestAboutUrl ?? null,
      leadership: church.bestLeadershipUrl ?? null,
    },
    evaluation: latestEvaluation,
  };
}

export type MinimalChurch = Prisma.ChurchGetPayload<{
  include: { addresses: true; serviceTimes: true; evaluations: { orderBy: { createdAt: "desc" }; take: number } };
}>;

export function emptyCoreDoctrineMap(): CoreDoctrineMap {
  return CORE_DOCTRINE_KEYS.reduce((acc, key) => {
    acc[key] = "unknown";
    return acc;
  }, {} as CoreDoctrineMap);
}
