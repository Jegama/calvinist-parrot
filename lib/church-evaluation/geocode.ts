export async function geocodeAddress(
  address: {
    street1?: string | null;
    city?: string | null;
    state?: string | null;
    postCode?: string | null;
  },
  signal?: AbortSignal,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const { street1, city, state, postCode } = address;
  const query = [street1, city, state, postCode]
    .filter((part) => Boolean(part && part.trim()))
    .join(", ");

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

  try {
    const response = await fetch(url.toString(), { signal });

    if (!response.ok) {
      console.warn("church_geocoding_upstream_failed", {
        http_status: response.status,
      });
      return { latitude: null, longitude: null };
    }

    const data = await response.json() as {
      features?: Array<{
        geometry?: {
          coordinates?: [number, number];
        };
      }>;
    };

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
  }
}
