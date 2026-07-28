import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchEvaluationRaw, CoreDoctrineMap } from "@/types/church";
import { ChurchEvaluationTimeoutError } from "@/lib/church-evaluation/runtime";

const mocks = vi.hoisted(() => {
  const transactionClient = {
    church: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    churchAddress: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    churchServiceTime: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    churchEvaluation: {
      create: vi.fn(),
    },
  };

  return {
    after: vi.fn(),
    afterCallbacks: [] as Array<() => Promise<void>>,
    extractChurchEvaluation: vi.fn(),
    geocodeAddress: vi.fn(),
    postProcessEvaluation: vi.fn(),
    mapChurchToDetail: vi.fn(),
    transactionClient,
    prisma: {
      church: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@/lib/churchMapper", () => ({
  mapChurchToDetail: mocks.mapChurchToDetail,
  mapChurchToListItem: vi.fn(),
}));

vi.mock("@/utils/churchEvaluation", () => ({
  extractChurchEvaluation: mocks.extractChurchEvaluation,
  geocodeAddress: mocks.geocodeAddress,
  postProcessEvaluation: mocks.postProcessEvaluation,
  toCoreDoctrineStatusEnum: (value: string) => value.toUpperCase(),
  toEvaluationStatusEnum: (value: string) => value.toUpperCase(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  isServerAdminUser: vi.fn(() => true),
}));

import { maxDuration, POST } from "./route";

const normalizedCore = {
  trinity: "true",
  gospel: "true",
  justification_by_faith: "true",
  christ_deity_humanity: "true",
  scripture_authority: "true",
  incarnation_virgin_birth: "true",
  atonement_necessary_sufficient: "true",
  resurrection_of_jesus: "true",
  return_and_judgment: "true",
  character_of_god: "true",
} satisfies CoreDoctrineMap;

const rawEvaluation: ChurchEvaluationRaw = {
  metadata: {
    model: "gemini-3.6-flash",
    prompt_version: "2026-07-28",
    policy_version: "2026-07-26",
    evaluated_at: "2026-07-28T00:00:00.000Z",
    source_pages: [{
      requested_url: "https://example.church/",
      resolved_url: "https://example.church/",
      content_sha256: "abc123",
    }],
  },
  church: {
    name: "Example Church",
    website: "https://example.church/",
    addresses: [{
      street_1: "1 Church Way",
      street_2: null,
      city: "Austin",
      state: "TX",
      post_code: "78701",
      source_url: "https://example.church/visit",
    }],
    contacts: { phone: null, email: null },
    service_times: ["Sunday 10:00"],
    best_pages_for: {
      beliefs: "https://example.church/beliefs",
      confession: null,
      about: "https://example.church/about",
      leadership: "https://example.church/leadership",
    },
    denomination: {
      label: "Reformed Baptist",
      confidence: 0.9,
      signals: ["confession"],
    },
    confession: {
      adopted: true,
      name: "Second London Baptist Confession (1689)",
      source_url: "https://example.church/beliefs",
    },
    core_doctrines: normalizedCore,
    secondary: {
      baptism: null,
      governance: null,
      lords_supper: null,
      gifts: null,
      sanctification: null,
      continuity: null,
      security: null,
      atonement_model: null,
    },
    tertiary: {
      eschatology: null,
      worship_style: null,
      counseling: null,
      creation: null,
      christian_liberty: null,
      discipline: null,
      parachurch: null,
      marriage_roles: null,
    },
    badges: ["📜 Reformed"],
    notes: [],
  },
};

const persistedChurch = {
  id: "church-1",
  addresses: [{
    id: "address-1",
    street1: "1 Church Way",
    city: "Austin",
    state: "TX",
    postCode: "78701",
  }],
  serviceTimes: [],
  evaluations: [],
};

describe("POST /api/churches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      mocks.afterCallbacks.push(callback);
    });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.transactionClient) => unknown) =>
        callback(mocks.transactionClient),
    );
    mocks.prisma.church.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedChurch);
    mocks.transactionClient.church.findUnique.mockResolvedValue(null);
    mocks.transactionClient.church.create.mockResolvedValue({ id: "church-1" });
    mocks.extractChurchEvaluation.mockResolvedValue(rawEvaluation);
    mocks.postProcessEvaluation.mockReturnValue({
      normalizedCore,
      badges: ["📜 Reformed"],
      coverageRatio: 1,
      coreOnSiteCount: 10,
      status: "recommended",
    });
    mocks.mapChurchToDetail.mockReturnValue({
      id: "church-1",
      name: "Example Church",
    });
    mocks.geocodeAddress.mockResolvedValue({
      latitude: 30.2672,
      longitude: -97.7431,
    });
  });

  it("persists and returns ChurchDetail before after() geocoding runs", async () => {
    const response = await POST(new Request("http://localhost/api/churches", {
      method: "POST",
      body: JSON.stringify({ website: "https://example.church" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "church-1",
      name: "Example Church",
    });
    expect(mocks.transactionClient.churchEvaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        churchId: "church-1",
        rawEvaluation: expect.objectContaining({
          metadata: expect.objectContaining({
            model: "gemini-3.6-flash",
            prompt_version: "2026-07-28",
          }),
        }),
      }),
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();

    await mocks.afterCallbacks[0]();

    expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
    expect(mocks.transactionClient.churchAddress.update).toHaveBeenCalledWith({
      where: { id: "address-1" },
      data: {
        latitude: 30.2672,
        longitude: -97.7431,
      },
    });
  });

  it("returns a controlled timeout before the platform ceiling", async () => {
    mocks.extractChurchEvaluation.mockRejectedValue(
      new ChurchEvaluationTimeoutError("gemini_core_doctrines", 55_000),
    );

    const response = await POST(new Request("http://localhost/api/churches", {
      method: "POST",
      body: JSON.stringify({ website: "https://example.church" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error:
        "Church evaluation timed out while waiting for an upstream service. Please try again.",
      code: "CHURCH_EVALUATION_TIMEOUT",
      stage: "gemini_core_doctrines",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("configures a five-minute route duration", () => {
    expect(maxDuration).toBe(300);
  });
});
