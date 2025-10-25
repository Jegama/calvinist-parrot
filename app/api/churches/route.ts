import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { mapChurchToDetail, mapChurchToListItem } from "@/lib/churchMapper";
import {
  extractChurchEvaluation,
  geocodeAddress,
  postProcessEvaluation,
  toCoreDoctrineStatusEnum,
  toEvaluationStatusEnum,
} from "@/utils/churchEvaluation";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import type { ChurchEvaluationRaw } from "@/types/church";

const DEFAULT_PAGE_SIZE = 10;

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = DEFAULT_PAGE_SIZE;

  const state = searchParams.get("state");
  const city = searchParams.get("city");
  const denomination = searchParams.get("denomination");
  const confessional = parseBooleanParam(searchParams.get("confessional"));

  const addressFilter: Prisma.churchAddressWhereInput = {};
  if (state) {
    addressFilter.state = { equals: state, mode: "insensitive" };
  }
  if (city) {
    addressFilter.city = { equals: city, mode: "insensitive" };
  }

  const where: Prisma.churchWhereInput = {};

  if (Object.keys(addressFilter).length > 0) {
    where.addresses = { some: addressFilter };
  }

  if (typeof confessional === "boolean") {
    where.confessionAdopted = confessional;
  }

  if (denomination) {
    where.denominationLabel = { equals: denomination, mode: "insensitive" };
  }

  const total = await prisma.church.count({ where });

  const churches = await prisma.church.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const items = churches.map((church) => mapChurchToListItem(church));

  return NextResponse.json({
    page,
    pageSize,
    total,
    items,
  });
}

export async function POST(request: Request) {
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

  let websiteUrl: string;
  try {
    websiteUrl = ensureUrl(websiteInput);
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  try {
    const rawEvaluation: ChurchEvaluationRaw = await extractChurchEvaluation(websiteUrl);
    const processed = postProcessEvaluation(rawEvaluation);

    const churchData = rawEvaluation.church;
    const fallbackName = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const churchName = churchData.name?.trim() || fallbackName;

    const addresses = Array.isArray(churchData.addresses) ? churchData.addresses : [];
    const serviceTimes = Array.isArray(churchData.service_times) ? churchData.service_times : [];
    const denominationSignals = Array.isArray(churchData.denomination?.signals)
      ? churchData.denomination.signals
      : [];

    const geocodedAddresses = await Promise.all(
      addresses.map((address, index) =>
        geocodeAddress({
          street1: address.street_1,
          city: address.city,
          state: address.state,
          postCode: address.post_code,
        }).then((coords) => ({ index, coords }))
      )
    );

    const detail = await prisma.$transaction(async (tx) => {
      const existing = await tx.church.findUnique({ where: { website: websiteUrl }, select: { id: true } });

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

      const churchId = existing
        ? existing.id
        : (await tx.church.create({ data: baseData })).id;

      if (existing) {
        await tx.church.update({ where: { id: churchId }, data: baseData });
      }

      await tx.churchAddress.deleteMany({ where: { churchId } });
      await tx.churchServiceTime.deleteMany({ where: { churchId } });

      await Promise.all(
        addresses.map((address, index) => {
          const coords = geocodedAddresses.find((entry) => entry.index === index)?.coords ?? {
            latitude: null,
            longitude: null,
          };
          return tx.churchAddress.create({
            data: {
              churchId,
              street1: address.street_1 ?? null,
              street2: address.street_2 ?? null,
              city: address.city ?? null,
              state: address.state ?? null,
              postCode: address.post_code ?? null,
              latitude: coords.latitude,
              longitude: coords.longitude,
              sourceUrl: address.source_url ?? null,
              isPrimary: index === 0,
            },
          });
        })
      );

      await Promise.all(
        serviceTimes.map((label) =>
          tx.churchServiceTime.create({
            data: {
              churchId,
              label,
            },
          })
        )
      );

      await tx.churchEvaluation.create({
        data: {
          churchId,
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
        },
      });

      const church = await tx.church.findUniqueOrThrow({
        where: { id: churchId },
        include: {
          addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          serviceTimes: { orderBy: { createdAt: "asc" } },
          evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      return church;
    });

    return NextResponse.json(mapChurchToDetail(detail));
  } catch (error) {
    console.error("Failed to evaluate church", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unable to evaluate church at this time";
    
    // Provide more specific error messages
    if (errorMessage.includes("Unable to gather website content")) {
      return NextResponse.json(
        { 
          error: "Could not access the church website. The site may be blocking crawlers, offline, or require authentication. Please verify the URL and try again." 
        },
        { status: 422 }
      );
    }
    
    if (errorMessage.includes("TAVILY_API_KEY")) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }
    
    if (errorMessage.includes("OPENAI_API_KEY")) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }
    
    return NextResponse.json(
      { error: errorMessage.length < 200 ? errorMessage : "Unable to evaluate church at this time" },
      { status: 500 }
    );
  }
}
