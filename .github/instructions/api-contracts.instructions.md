---
applyTo: "{app/api/v1/**,lib/api/contracts/**,lib/api/openapi.ts,lib/api/spec.ts,scripts/generate-openapi.ts,docs/api/openapi.json}"
---

# API Contract Guidance

- Treat Zod schemas in `lib/api/contracts/` as the runtime and documentation source of truth. Infer TypeScript types from those schemas rather than maintaining parallel interfaces.
- Use strict v1 request schemas and resolve identity server-side from the Appwrite session or server-managed `guestId` cookie. Never accept a caller-supplied `userId` in a v1 contract.
- Keep operation-specific v1 routes: create a chat, fetch a chat, stream a message, stop a request, and stream QA. Do not combine stop, create, and message behavior into one v1 operation.
- Stream `application/x-ndjson`; each line must be one complete object matching the relevant discriminated event union. Errors that occur after streaming begins are in-band `error` events.
- Preserve `requestId` idempotency and the documented `409` behavior for conflicting or already-completed chat requests.
- Generate OpenAPI 3.1 with native Zod 4 `z.toJSONSchema` through `buildSpec()` and `serializeSpec()`. Importing the generator must not write files.
- After changing a contract, run `npm run openapi:generate` and commit `docs/api/openapi.json`. The drift test must remain byte-for-byte clean.
- Keep legacy `/api/parrot-chat` and `/api/parrot-qa` operations marked deprecated until their compatibility shims are deliberately removed.
- Keep the legacy response `Deprecation` and `Link` headers compliant with RFC 9745, and preserve the privacy-safe `deprecated_api_request` runtime log until usage has been measured over the agreed observation window.
- Pin documentation assets to an exact version with verified Subresource Integrity and `crossorigin="anonymous"`.
