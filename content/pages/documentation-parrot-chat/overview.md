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

## Theological Commitments

Denominational modes affect secondary doctrines while sharing non-negotiable commitments: the Trinity; God's holy, sovereign, loving, and just character; the inspiration, inerrancy, and authority of Scripture; Christ's true deity and humanity; the incarnation and virgin birth; the necessity and sufficiency of Christ's atonement; the historical death, burial, and bodily resurrection of Christ; justification by grace alone through faith alone in Christ alone; Christ's bodily return; final judgment; and the renewal of all things.

The supported modes are Reformed Baptist (default), Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal or Charismatic, and Non-Denominational Evangelical.

For the classic multi-agent question-and-answer workflow, see the [Parrot QA API](/documentation-parrot-qa).
