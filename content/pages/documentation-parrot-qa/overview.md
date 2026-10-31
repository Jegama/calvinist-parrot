# Counsel of Three Is Retired

Counsel of Three (Parrot QA) stopped accepting new requests on October 31, 2026. Use [Parrot chat](/) for Bible and theology questions. Previously saved answers are preserved.

## Migrating API Clients

`POST /api/v1/qa`, `POST /api/parrot-qa`, and `POST /api/elaborate` now return HTTP `410 Gone` with a JSON error explaining the retirement. These routes no longer stream answers or invoke models. Their responses include deprecation metadata and a link to migration documentation.

To continue through Parrot chat:

1. Create a conversation with `POST /api/v1/chats`, sending your question as `initialQuestion`.
2. Use the returned `chatId`, `messageId`, and `requestId` to send the initial question through `POST /api/v1/chats/{chatId}/messages` as described in the [Parrot Chat API documentation](/documentation-parrot-chat).
3. Read the `application/x-ndjson` chat events. The historical Q&A event types, such as `agent_responses` and `calvin_review`, are not emitted by chat.

Identity is resolved server-side from the Appwrite session or guest cookie. Retain the cookies returned by the API and do not send `userId` in v1 requests.

The [interactive API reference](/api/v1/docs) and [OpenAPI document](/api/v1/openapi.json) describe the current request schemas and retirement responses.
