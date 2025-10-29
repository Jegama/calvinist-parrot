import { NextResponse } from "next/server";

type NominatimResponse = Array<{
  place_id: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  osm_type?: string;
  osm_id?: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    church?: string;
    place?: string;
  };
  extratags?: {
    website?: string;
    "contact:website"?: string;
  };
}>;

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ?? "CalvinistParrotChurchFinder/1.0 (contact@calvinistparrot.local)";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const state = searchParams.get("state");
  const country = searchParams.get("country") ?? "USA";

  if (!city) {
    return NextResponse.json({ error: "city query parameter is required" }, { status: 400 });
  }

  const queryParts = ["churches", city];
  if (state) queryParts.push(state);
  if (country) queryParts.push(country);
  const query = queryParts.join(" ");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1"); // Request extra tags including website

  try {
    const response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Search service unavailable" }, { status: 502 });
    }

    const data = (await response.json()) as NominatimResponse;

    const results = Array.isArray(data)
      ? data.map((item) => {
          const latitude = item.lat ? Number.parseFloat(item.lat) : null;
          const longitude = item.lon ? Number.parseFloat(item.lon) : null;
          
          // Extract website from extratags
          const website = item.extratags?.website || item.extratags?.["contact:website"] || null;
          
          return {
            id: String(item.place_id),
            name: item.name ?? item.address?.church ?? item.address?.place ?? item.display_name ?? "Unknown",
            displayName: item.display_name ?? null,
            latitude: Number.isFinite(latitude ?? NaN) ? (latitude as number) : null,
            longitude: Number.isFinite(longitude ?? NaN) ? (longitude as number) : null,
            address: {
              city: item.address?.city || item.address?.town || item.address?.village,
              state: item.address?.state,
              country: item.address?.country,
            },
            website,
            osmType: item.osm_type,
            osmId: item.osm_id,
          };
        })
      : [];

    return NextResponse.json(results);
  } catch (error) {
    console.error("Church search failed", error);
    return NextResponse.json({ error: "Unable to search for churches" }, { status: 500 });
  }
}
