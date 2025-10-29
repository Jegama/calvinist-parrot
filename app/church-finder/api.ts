import type {
  ChurchDetail,
  ChurchListResponse,
  ChurchMetaResponse,
  ChurchSearchResult,
} from "@/types/church";

export type ChurchFilters = {
  page?: number;
  state?: string | null;
  city?: string | null;
  denomination?: string | null;
  confessional?: "true" | "false" | null;
  status?: "historic_reformed" | "recommended" | "caution" | "red_flag" | "exclude_red_flag" | null;
};

function buildQuery(params: ChurchFilters): string {
  const searchParams = new URLSearchParams();
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.state) searchParams.set("state", params.state);
  if (params.city) searchParams.set("city", params.city);
  if (params.denomination) searchParams.set("denomination", params.denomination);
  if (params.confessional) searchParams.set("confessional", params.confessional);
  if (params.status) searchParams.set("status", params.status);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchChurches(filters: ChurchFilters = {}): Promise<ChurchListResponse> {
  const response = await fetch(`/api/churches${buildQuery(filters)}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to load churches");
  }

  return (await response.json()) as ChurchListResponse;
}

export async function fetchChurchDetail(id: string): Promise<ChurchDetail> {
  const response = await fetch(`/api/churches/${id}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load church details");
  }
  return (await response.json()) as ChurchDetail;
}

export async function fetchChurchMeta(): Promise<ChurchMetaResponse> {
  const response = await fetch(`/api/churches/meta`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load filter metadata");
  }
  return (await response.json()) as ChurchMetaResponse;
}

export async function searchChurches(params: {
  city: string;
  state?: string;
  country?: string;
}): Promise<ChurchSearchResult[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("city", params.city);
  if (params.state) searchParams.set("state", params.state);
  if (params.country) searchParams.set("country", params.country);

  const response = await fetch(`/api/churches/search?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Search failed");
  }

  return (await response.json()) as ChurchSearchResult[];
}

export async function checkChurchExists(website: string): Promise<{ exists: boolean; churchId?: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("website", website);

  const response = await fetch(`/api/churches/check?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to check church existence");
  }

  return (await response.json()) as { exists: boolean; churchId?: string };
}

export async function createChurch(payload: {
  website: string;
  forceReEvaluate?: boolean;
  userId?: string;
}): Promise<ChurchDetail> {
  const response = await fetch(`/api/churches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error?.error ?? "Unable to create church");
  }

  return (await response.json()) as ChurchDetail;
}
