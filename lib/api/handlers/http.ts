import { NextResponse } from "next/server";
import { z } from "zod";

export const LEGACY_API_HEADERS = {
  Deprecation: "@1785024000",
  Link: '</api/v1/docs>; rel="deprecation"; type="text/html"',
} as const;

type LegacyApiRoute = "/api/parrot-chat" | "/api/parrot-qa";

export function recordLegacyApiUse(
  request: Request,
  route: LegacyApiRoute,
) {
  const replacement =
    route === "/api/parrot-chat" ? "/api/v1/chats" : "/api/v1/qa";

  console.warn(
    JSON.stringify({
      event: "deprecated_api_request",
      route,
      method: request.method,
      replacement,
      deprecationDocs: "/api/v1/docs",
      vercelRequestId: request.headers.get("x-vercel-id"),
    }),
  );
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse }
> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: parsed.data };
}

export function withHeaders(
  response: Response,
  headers: Record<string, string>,
) {
  const nextHeaders = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) {
    nextHeaders.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

export async function executeLegacySafely(
  operation: () => Promise<Response>,
) {
  try {
    return withHeaders(await operation(), LEGACY_API_HEADERS);
  } catch (error) {
    console.error("Legacy API request failed before streaming began", error);
    return withHeaders(
      NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      ),
      LEGACY_API_HEADERS,
    );
  }
}

export async function executeV1Safely(
  operation: () => Promise<Response>,
) {
  try {
    return await operation();
  } catch (error) {
    console.error("V1 API request failed before streaming began", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
