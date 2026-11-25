import { recordExternalUsageAttempt, startExternalUsageAttempt, type UsageContext } from "@/lib/provider-usage";

type GeocodingAddress = {
  street1?: string | null;
  city?: string | null;
  state?: string | null;
  postCode?: string | null;
};

function addressQuery({ street1, city, state, postCode }: GeocodingAddress) {
  return [street1, city, state, postCode].filter(part => part?.trim()).join(", ");
}

export function canGeocodeAddress(address: GeocodingAddress) {
  return Boolean(process.env.GEOAPIFY_API_KEY && addressQuery(address));
}

export async function geocodeAddress(
  address: GeocodingAddress,
  signal?: AbortSignal,
  usage?: UsageContext,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const query = addressQuery(address);
  if (!query) {
    return { latitude: null, longitude: null };
  }

  if (!process.env.GEOAPIFY_API_KEY) {
    console.warn("GEOAPIFY_API_KEY not configured, skipping geocoding");
    return { latitude: null, longitude: null };
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY);
  url.searchParams.set("limit", "1");
  url.searchParams.set("type", "amenity");

  const attempt = usage && startExternalUsageAttempt(usage, "geoapify", "credit");
  if (attempt) await recordExternalUsageAttempt(attempt, "started", 0, null);
  let credits: number | null = null;
  let outcome: "success" | "provider_error" | "invalid_output" = "provider_error";
  try {
    const response = await fetch(url.toString(), { signal });

    if (!response.ok) {
      console.warn("church_geocoding_upstream_failed", {
        http_status: response.status,
      });
      return { latitude: null, longitude: null };
    }

    // A successful single-address geocoding request consumes one credit,
    // including an empty result (https://www.geoapify.com/geocoding-api/).
    credits = 1;
    outcome = "invalid_output";
    const data = await response.json() as {
      features?: Array<{
        geometry?: {
          coordinates?: [number, number];
        };
      }>;
    };

    outcome = "success";
    const coordinates = data.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length !== 2) {
      console.warn("church_geocoding_no_results");
      return { latitude: null, longitude: null };
    }

    const [longitude, latitude] = coordinates;
    return {
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    console.error("church_geocoding_upstream_error", {
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return { latitude: null, longitude: null };
  } finally {
    if (attempt) {
      await recordExternalUsageAttempt(attempt, outcome, Date.now() - attempt.startedAt.getTime(), credits);
    }
  }
}
