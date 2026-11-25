import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";
import { isServerAdminUser } from "@/lib/admin";
import { mapChurchToDetail } from "@/lib/churchMapper";
import type { ChatChannel } from "@/lib/chat-analytics";
import { providerUsageEnvironment, type UsageContext } from "@/lib/provider-usage";
import prisma from "@/lib/prisma";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import type { ChurchEvaluationRaw } from "@/types/church";
import {
  extractChurchEvaluation,
  geocodeAddress,
  postProcessEvaluation,
  toCoreDoctrineStatusEnum,
  toEvaluationStatusEnum,
} from "@/utils/churchEvaluation";
import {
  ChurchEvaluationTimeoutError,
  ChurchEvaluationUpstreamError,
  logEvaluationStage,
  measureEvaluationStage,
  runEvaluationStage,
} from "./runtime";
import { canGeocodeAddress } from "./geocode";
import { churchUsageStage, newChurchEvaluationOperation } from "./usage";

const BACKGROUND_GEOCODING_BUDGET_MS = 20_000;

function ensureUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    const prefixed = `https://${value}`;
    const url = new URL(prefixed);
    return url.toString();
  }
}

/**
 * Build normalized evaluation data for database persistence
 * This is extracted to avoid duplication between immediate response and background job
 */
function buildEvaluationData(
  rawEvaluation: ChurchEvaluationRaw,
  processed: ReturnType<typeof postProcessEvaluation>
) {
  const churchData = rawEvaluation.church;

  return {
    rawEvaluation: rawEvaluation as unknown as Prisma.JsonObject,
    badges: processed.badges,
    secondary: (churchData.secondary ?? null) as Prisma.InputJsonValue,
    tertiary: (churchData.tertiary ?? null) as Prisma.InputJsonValue,
    coreOnSiteCount: processed.coreOnSiteCount,
    coreTotalCount: CORE_DOCTRINE_KEYS.length,
    coverageRatio: processed.coverageRatio,
    status: toEvaluationStatusEnum(processed.status),
    coreTrinity: toCoreDoctrineStatusEnum(processed.normalizedCore.trinity),
    coreGospel: toCoreDoctrineStatusEnum(processed.normalizedCore.gospel),
    coreJustificationByFaith: toCoreDoctrineStatusEnum(
      processed.normalizedCore.justification_by_faith
    ),
    coreChristDeityHumanity: toCoreDoctrineStatusEnum(
      processed.normalizedCore.christ_deity_humanity
    ),
    coreScriptureAuthority: toCoreDoctrineStatusEnum(
      processed.normalizedCore.scripture_authority
    ),
    coreIncarnationVirginBirth: toCoreDoctrineStatusEnum(
      processed.normalizedCore.incarnation_virgin_birth
    ),
    coreAtonementNecessary: toCoreDoctrineStatusEnum(
      processed.normalizedCore.atonement_necessary_sufficient
    ),
    coreResurrectionOfJesus: toCoreDoctrineStatusEnum(
      processed.normalizedCore.resurrection_of_jesus
    ),
    coreReturnAndJudgment: toCoreDoctrineStatusEnum(
      processed.normalizedCore.return_and_judgment
    ),
    coreCharacterOfGod: toCoreDoctrineStatusEnum(processed.normalizedCore.character_of_god),
  };
}

type PersistedAddressForGeocoding = {
  id: string;
  street1: string | null;
  city: string | null;
  state: string | null;
  postCode: string | null;
};

function scheduleAddressGeocoding(
  tasks: { address: PersistedAddressForGeocoding; usage: UsageContext }[],
): void {
  if (tasks.length === 0) return;

  after(async () => {
    try {
      await runEvaluationStage({
        stage: "background_geocoding",
        deadlineAt: Date.now() + BACKGROUND_GEOCODING_BUDGET_MS,
        maxDurationMs: BACKGROUND_GEOCODING_BUDGET_MS,
        operation: async (signal) => {
          const geocodedAddresses = await Promise.all(
            tasks.map(async ({ address, usage }) => ({
              id: address.id,
              coords: await geocodeAddress(address, signal, usage),
            })),
          );

          await prisma.$transaction(async (tx) => {
            for (const entry of geocodedAddresses) {
              await tx.churchAddress.update({
                where: { id: entry.id },
                data: {
                  latitude: entry.coords.latitude,
                  longitude: entry.coords.longitude,
                },
              });
            }
          });
        },
      });
    } catch (error) {
      console.error("church_geocoding_background_failed", {
        error_name: error instanceof Error ? error.name : "UnknownError",
        address_count: tasks.length,
      });
    }
  });
}

export async function evaluateChurch(request: Request, channel: ChatChannel) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const websiteInput = typeof payload.website === "string" ? payload.website.trim() : "";
  if (!websiteInput) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  const forceReEvaluate = payload.forceReEvaluate === true;

  let websiteUrl: string;
  try {
    websiteUrl = ensureUrl(websiteInput);
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  // Check if church already exists
  const existing = await prisma.church.findUnique({
    where: { website: websiteUrl },
    select: { id: true },
  });

  // If church exists and not forcing re-evaluation, return error
  if (existing && !forceReEvaluate) {
    return NextResponse.json(
      {
        error: "Church already exists",
        churchId: existing.id,
        exists: true,
      },
      { status: 409 }
    );
  }

  // If forcing re-evaluation, validate admin permission
  if (forceReEvaluate) {
    const authenticatedUser = await getAuthenticatedUser();

    if (!isServerAdminUser({ request, user: authenticatedUser })) {
      return NextResponse.json(
        { error: "Unauthorized: Only admins can re-evaluate churches" },
        { status: 403 }
      );
    }
  }

  const evaluationStartedAt = Date.now();
  let sourcePageCount = 0;

  try {
    const operation = newChurchEvaluationOperation(channel);
    const rawEvaluation: ChurchEvaluationRaw = await extractChurchEvaluation(websiteUrl, { operation });
    sourcePageCount = rawEvaluation.metadata?.source_pages.length ?? 0;
    const processed = await measureEvaluationStage({
      stage: "post_processing",
      operation: () => postProcessEvaluation(rawEvaluation),
      dimensions: { sourcePageCount },
    });

    const churchData = rawEvaluation.church;
    const fallbackName = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const churchName = churchData.name?.trim() || fallbackName;

    const addresses = Array.isArray(churchData.addresses) ? churchData.addresses : [];
    const serviceTimes = Array.isArray(churchData.service_times) ? churchData.service_times : [];
    const denominationSignals = Array.isArray(churchData.denomination?.signals)
      ? churchData.denomination.signals
      : [];

    // Build normalized evaluation data once (shared by persistence + response)
    const evaluationData = buildEvaluationData(rawEvaluation, processed);

    const baseData = {
      name: churchName,
      website: websiteUrl,
      phone: churchData.contacts?.phone ?? null,
      email: churchData.contacts?.email ?? null,
      denominationLabel: churchData.denomination?.label ?? null,
      denominationConfidence: churchData.denomination?.confidence ?? null,
      denominationSignals,
      confessionAdopted: churchData.confession?.adopted ?? false,
      confessionName: churchData.confession?.name ?? null,
      confessionSourceUrl: churchData.confession?.source_url ?? null,
      bestBeliefsUrl: churchData.best_pages_for?.beliefs ?? null,
      bestConfessionUrl: churchData.best_pages_for?.confession ?? null,
      bestAboutUrl: churchData.best_pages_for?.about ?? null,
      bestLeadershipUrl: churchData.best_pages_for?.leadership ?? null,
    };

    const persisted = await measureEvaluationStage({
      stage: "persistence",
      dimensions: { sourcePageCount },
      operation: async () => {
        const { churchId, geocodingTasks } = await prisma.$transaction(async (tx) => {
          const existingChurch = await tx.church.findUnique({
            where: { website: websiteUrl },
            select: { id: true },
          });

          let persistedChurchId: string;

          if (existingChurch) {
            persistedChurchId = existingChurch.id;
            await tx.church.update({
              where: { id: persistedChurchId },
              data: baseData,
            });
            await tx.churchAddress.deleteMany({
              where: { churchId: persistedChurchId },
            });
            await tx.churchServiceTime.deleteMany({
              where: { churchId: persistedChurchId },
            });
          } else {
            const createdChurch = await tx.church.create({ data: baseData });
            persistedChurchId = createdChurch.id;
          }

          const geocodingTasks = [];
          for (const [index, address] of addresses.entries()) {
            const savedAddress = await tx.churchAddress.create({
              data: {
                churchId: persistedChurchId,
                street1: address.street_1 ?? null,
                street2: address.street_2 ?? null,
                city: address.city ?? null,
                state: address.state ?? null,
                postCode: address.post_code ?? null,
                latitude: null,
                longitude: null,
                sourceUrl: address.source_url ?? null,
                isPrimary: index === 0,
              },
            });
            if (canGeocodeAddress(savedAddress)) {
              geocodingTasks.push({ address: savedAddress, usage: churchUsageStage(operation, "geocode") });
            }
          }

          for (const label of serviceTimes) {
            await tx.churchServiceTime.create({
              data: {
                churchId: persistedChurchId,
                label,
              },
            });
          }

          await tx.churchEvaluation.create({
            data: {
              churchId: persistedChurchId,
              id: operation.operationId,
              channel,
              usageEnvironment: providerUsageEnvironment(),
              expectedUsageAttempts: operation.expectedUsageAttempts,
              ...evaluationData,
            },
          });

          return { churchId: persistedChurchId, geocodingTasks };
        });

        const savedChurch = await prisma.church.findUnique({
          where: { id: churchId },
          include: {
            addresses: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            },
            serviceTimes: { orderBy: { createdAt: "asc" } },
            evaluations: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        if (!savedChurch) {
          throw new Error("Unable to persist church");
        }

        return { savedChurch, geocodingTasks };
      },
    });

    scheduleAddressGeocoding(persisted.geocodingTasks);
    logEvaluationStage({
      stage: "total",
      status: "success",
      startedAt: evaluationStartedAt,
      dimensions: { sourcePageCount },
    });
    return NextResponse.json(mapChurchToDetail(persisted.savedChurch));
  } catch (error) {
    logEvaluationStage({
      stage: "total",
      status: error instanceof ChurchEvaluationTimeoutError
        ? "timeout"
        : "error",
      startedAt: evaluationStartedAt,
      dimensions: { sourcePageCount },
      error,
    });
    console.error("church_evaluation_request_failed", {
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_code: error instanceof ChurchEvaluationTimeoutError ||
          error instanceof ChurchEvaluationUpstreamError
        ? error.code
        : undefined,
      stage: error instanceof ChurchEvaluationTimeoutError ||
          error instanceof ChurchEvaluationUpstreamError
        ? error.stage
        : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : "Unable to evaluate church at this time";

    if (error instanceof ChurchEvaluationTimeoutError) {
      return NextResponse.json(
        {
          error: "Church evaluation timed out while waiting for an upstream service. Please try again.",
          code: error.code,
          stage: error.stage,
        },
        { status: 504 },
      );
    }

    if (error instanceof ChurchEvaluationUpstreamError) {
      return NextResponse.json(
        {
          error: "An upstream service could not complete the church evaluation. Please try again.",
          code: error.code,
          stage: error.stage,
        },
        { status: 502 },
      );
    }

    if (errorMessage.includes("Unable to gather website content")) {
      return NextResponse.json(
        {
          error: "Could not access the church website. The site may be blocking crawlers, offline, or require authentication. Please verify the URL and try again."
        },
        { status: 422 }
      );
    }

    if (
      errorMessage.includes("TAVILY_API_KEY") ||
      errorMessage.includes("GEMINI_API_KEY")
    ) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    return NextResponse.json(
      { error: errorMessage.length < 200 ? errorMessage : "Unable to evaluate church at this time" },
      { status: 500 }
    );
  }
}
