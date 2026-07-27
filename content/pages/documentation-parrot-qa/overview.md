# Parrot QA API

## Overview

Parrot QA provides Calvinist Parrot's classic structured question-and-answer workflow. It categorizes a theological question, gathers three independent answers, asks a reviewer agent to assess them, and streams a concise synthesized response.

New integrations should use `POST /api/v1/qa`. The former `/api/parrot-qa` endpoint remains available as a deprecated compatibility route.

## API Reference

The generated contract is the source of truth for the request schema, status codes, examples, and every newline-delimited JSON event:

- [Interactive API reference](/api/v1/docs)
- [OpenAPI 3.1 document](/api/v1/openapi.json)

## How It Works

The workflow begins by reformulating and categorizing the question. It then sends the question to the Counsel of Three, whose independent answers provide multiple perspectives for comparison. A reviewer evaluates those answers for theological accuracy and helpfulness before the final answer is synthesized and streamed to the caller.

Progress, categorization, intermediate reasoning results, the reviewer assessment, and final-answer chunks are represented as documented `application/x-ndjson` events. Consumers should treat the generated OpenAPI document as authoritative rather than depending on prose examples.

## Reviewer Agent

The current reviewer is Calvin, who assesses the three answers with particular attention to John Calvin's *Institutes of the Christian Religion*. This review is an additional theological safeguard and informs the final synthesis; it is not presented as a substitute for Scripture or pastoral care in a local church.

## Identity and Privacy

Identity is resolved by the server. Signed-in users are identified through the Appwrite session cookie, while guests receive a server-managed `guestId` cookie. The v1 endpoint does not accept a caller-supplied `userId`; server integrations should retain the cookies returned for the conversation actor.

## Theological Commitments

Denominational modes affect secondary doctrines while sharing non-negotiable commitments: the Trinity; God's holy, sovereign, loving, and just character; the inspiration, inerrancy, and authority of Scripture; Christ's true deity and humanity; the incarnation and virgin birth; the necessity and sufficiency of Christ's atonement; the historical death, burial, and bodily resurrection of Christ; justification by grace alone through faith alone in Christ alone; Christ's bodily return; final judgment; and the renewal of all things.

The supported modes are Reformed Baptist (default), Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal or Charismatic, and Non-Denominational Evangelical.

For the primary conversational experience, see the [Parrot Chat API](/documentation-parrot-chat).
