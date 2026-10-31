import { errorResponseSchema } from "../contracts/common";
import { QA_RETIREMENT_HEADERS, QA_RETIREMENT_MESSAGE } from "../qa-retirement";
import { LEGACY_API_HEADERS, recordLegacyApiUse, withHeaders } from "./http";

/** Retired routes never read request bodies, initialize providers, or write history. */
export function handleQa() {
  return Response.json(
    errorResponseSchema.parse({ error: QA_RETIREMENT_MESSAGE }),
    { status: 410, headers: QA_RETIREMENT_HEADERS },
  );
}

export function handleLegacyQaPost(request: Request) {
  recordLegacyApiUse(request, "/api/parrot-qa");
  return withHeaders(handleQa(), LEGACY_API_HEADERS);
}
