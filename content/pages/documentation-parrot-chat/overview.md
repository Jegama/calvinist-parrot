# Parrot Chat API

## Overview

Parrot Chat is Calvinist Parrot's primary conversational API. The current implementation uses a LangGraph agent that can maintain conversation context, call theological research tools, stream intermediate progress, and produce a pastorally oriented final response.

The stable API is organized around chat resources:

- Create a chat
- Read a chat and its message history
- Send a message and receive a newline-delimited JSON stream
- Stop an in-progress request

The former `/api/parrot-chat` endpoint remains available as a deprecated compatibility route. New integrations should use the `/api/v1/chats` resources.

## API Reference

The generated contract is the source of truth for paths, request and response schemas, status codes, examples, and streaming event shapes:

- [Interactive API reference](/api/v1/docs)
- [OpenAPI 3.1 document](/api/v1/openapi.json)

The interactive reference also describes the required `application/x-ndjson` stream handling and request identifiers used for retries, conflict detection, and cancellation.

## Using an MCP client

Connect a remote Streamable HTTP client to `/api/mcp` on the Parrot deployment. On the public site the endpoint is `https://www.calvinistparrot.com/api/mcp`. Run `tools/list` to see the current input schemas and tool annotations. `find_churches` and `get_church` work without an account. `ask_parrot` sends the question through the Parrot chat service and returns the final answer with its inline citations. If the research tools supplied separate source summaries, the response includes them in `sources`. The service persists the chat transcript. An anonymous question is isolated and has no follow-up reference. Guests can send up to 10 chat requests per hour per network.

For saved follow-ups, connect your Parrot account and grant the `chat.write` scope. A connected account can send up to 20 chat requests per minute. Authorized questions appear in that account’s chat history. Ask the first question with `saveConversation` set to `true`. Keep the returned `conversationRef` and request IDs private and use it for subsequent turns on the same account. Generate a fresh random UUIDv4 `requestId` for each new question. If a call times out, retry with the original inputs and UUID. Reusing that UUID for a different question produces a conflict.

### Checking a client connection

Use two test accounts and a deployment with OAuth and guest chat enabled. These checks can incur model usage. Repeat them in each target client and record the client version, deployment, and observed result. ChatGPT and Claude require access to custom remote connectors in the chosen workspace. Codex needs a configured HTTP MCP server. A client that can browse the anonymous directory still needs a successful OAuth consent and follow-up check before private chat can be marked as working. Client-specific setup and live verification are tracked in [issue #107](https://github.com/Jegama/calvinist-parrot/issues/107).

| Check | Action and expected result |
| --- | --- |
| Guest question | With no account connected, ask “What does it mean to show patience?” Save the answer and confirm the original Scripture citations are present. Repeat the identical call with its original `requestId`. Expect the same answer and no `conversationRef`. |
| Saved follow-up | Connect account A, consent to `chat.write`, and ask the same question with a new `requestId` and `saveConversation` set to `true`. Ask “How could I practice it?” using the returned `conversationRef` and another new UUID. Expect a response in the original conversation. |
| Isolation and expiry | Connect account B and try account A's reference. Expect an error without any of A's transcript. Revoke account A's grant and retry with its former token. Expect an authorization error and a new sign-in flow before private chat resumes. |
| Saved directory reads | Call `find_churches` with a city or denomination and `pageSize` set to `2`. Expect at most two saved evaluated churches. If `hasMore` is true, increment `page`. Open one returned `id` with `get_church` and a fresh UUID `operationId`. Check its latest evaluation and supporting links. Reuse the same `operationId` for a retry. |
| Empty and missing results | Search for a city absent from the saved directory. Expect an empty `items` list and `hasMore` set to `false`. A missing church ID returns a tool error. |

## How It Works

### Chat initialization

A chat can begin with a question alone or with an existing question-and-answer pair, such as a result carried forward from Parrot QA. The server stores the initial transcript and returns stable identifiers that clients can use for navigation and subsequent requests.

### Conversation continuation

Each new message is evaluated with the stored transcript and the user's effective denominational preference. The agent may call research tools, publish progress events, stream the answer in chunks, and persist the completed turn for future context.

Every submitted turn has a request identifier. This makes retries explicit, prevents competing requests from silently overwriting one another, and gives the stop endpoint a precise request to cancel.

### Research tools and sources

The LangGraph agent can consult approved theological resources and report both temporary tool progress and persistent tool summaries. Source material that should remain visible in the transcript is returned as part of the documented stream rather than through a separate undocumented response channel.

### Memory extraction and personalization

After a response completes, a background process can extract conservative pastoral context from the conversation. Examples include spiritual maturity, ministry context, preferred answer depth, church involvement, Gospel-presentation history, and the kinds of doctrinal questions the person has asked.

Memory extraction does not block the response stream. Failures are logged without failing the completed answer, and weak signals do not overwrite established preferences. Stored memory remains scoped to the resolved conversation actor.

## Identity and Privacy

Identity is resolved by the server. Signed-in users are identified through the Appwrite session cookie, while guests receive a server-managed `guestId` cookie. When a guest signs in, eligible guest chats are transferred to the authenticated account.

The v1 API does not accept a caller-supplied `userId`. Browser clients should include credentials normally, and server integrations should retain the cookies returned for the conversation actor. Chat history access is checked against that resolved actor, and internal ownership identifiers are not part of the public response contract.

The website sends new chat operations through its own first-party routes. Public clients continue to use the documented v1 endpoints with the same cookies, request identifiers and ownership checks. Analytics records the server entry point and actor when each chat or submission is created. Signing in later preserves the attribution of earlier turns.

## Theological Commitments

Denominational modes affect secondary doctrines while sharing non-negotiable commitments: the Trinity; God's holy, sovereign, loving, and just character; the inspiration, inerrancy, and authority of Scripture; Christ's true deity and humanity; the incarnation and virgin birth; the necessity and sufficiency of Christ's atonement; the historical death, burial, and bodily resurrection of Christ; justification by grace alone through faith alone in Christ alone; Christ's bodily return; final judgment; and the renewal of all things.

The supported modes are Reformed Baptist (default), Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal or Charismatic, and Non-Denominational Evangelical.

The former Counsel of Three Q&A workflow is retired. Its endpoints return HTTP `410 Gone`; use this chat API for new integrations. See the [Q&A migration guide](/documentation-parrot-qa).
