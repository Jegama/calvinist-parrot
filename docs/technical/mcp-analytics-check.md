# MCP requests in Parrot analytics

On November 27, 2026 (America/Chicago), a fresh MCP SDK client connected over Streamable HTTP to a running copy of Parrot 2.6.1 at commit `3a1fd2e`. The server used a migrated local PostgreSQL database, the five Church Finder seed evaluations and live model providers. The comparison client used Node's HTTP fetch against the same server and kept the guest cookie returned by the v1 chat API.

## A guest question through two channels

Both clients asked “What does it mean to show patience? In two sentences, include one Scripture reference.” Both returned two sentences describing restraint and trust in God's timing, and both cited 1 Corinthians 13:4. The MCP result included the original citation and omitted a conversation reference. Replaying the identical MCP inputs returned the identical answer in 38 ms.

| Client path | Elapsed | HTTP response body bytes | Final answer bytes | Priced Parrot attempts | Estimated Parrot spend |
| --- | ---: | ---: | ---: | ---: | ---: |
| MCP `ask_parrot` | 3.324 s | 817 | 278 | 1 | $0.001321 |
| v1 create chat and stream first message | 8.636 s | 2,815 | 369 | 3 | $0.00470505 |

Each row is one observation from the local development server. Timing starts after MCP setup and ends after the client consumes the full response. The v1 elapsed time includes development route compilation and a failed connection to the optional Study Bible tool. Response sizes count decoded HTTP bodies, including both copies of the MCP answer (text and structured content) or the v1 creation response and all NDJSON events. Final answer sizes count UTF-8 text alone. A client can return only that text to its model. The client model's context window, tokenizer and charges were outside this measurement.

Parrot's pricing view attributed one Claude Haiku 5.5 call to each answer. The guest MCP call used 10,735 input and 495 output tokens. The v1 agent call used 11,575 input and 488 output tokens ($0.0014015), and its turn also triggered a Gemini title ($0.0030345) and GPT memory extraction ($0.00026905). The displayed prices use recorded provider counters and Parrot's rate table. In the successful comparison window all four attempts had prices. An earlier attempt before enabling the environment's outbound proxy timed out and lacked provider counters. Its spend remains unknown.

## What the dashboard counted

| Issue | Observation in the successful comparison window |
| --- | --- |
| [#97 channel attribution](https://github.com/Jegama/calvinist-parrot/issues/97) | Each channel recorded one guest-created chat, one genuine submission and one reply. The MCP replay added zero events. |
| [#98 chat spend](https://github.com/Jegama/calvinist-parrot/issues/98) | One completed turn per channel, two combined. All four provider attempts linked to their submission's operation. Combined estimated spend was $0.00602605, including the asynchronous memory call. |
| [#99 evaluation spend](https://github.com/Jegama/calvinist-parrot/issues/99) | `find_churches` returned two saved entries. MCP and v1 both returned the recommended evaluation for Silicon Valley Reformed Baptist Church, with five supporting links. The directory still contained five evaluations, with zero new evaluation attempts, completions or dollars on either channel. |
| [#100 engagement](https://github.com/Jegama/calvinist-parrot/issues/100) | Each external channel recorded one answer and one church record retrieval. Reusing the MCP detail operation ID preserved its single retrieval. The website chat and church engagement steps received zero events from these calls. |

## Repeating the check

1. Use a migrated, seeded local database with a working chat provider and `MCP_SECRET`. Record the start time after migrations and seeding. Connect the SDK's `StreamableHTTPClientTransport` to the local `/api/mcp` endpoint and list its tools.
2. Call `find_churches` with `pageSize: 2`. Open a returned ID with `get_church`, supplying a fresh UUID as `operationId`, and repeat that lookup with the same inputs. Use the v1 directory endpoints to open the same ID, supplying a new UUID in the detail request's `Idempotency-Key` header.
3. Send the question above to `ask_parrot` with a fresh UUIDv4 as `requestId`, then replay it. For v1, create a chat with `initialQuestion`. Send the message to the returned chat's messages endpoint with the guest cookie, returned `messageId` and `requestId`, the same question as `message` and `isAutoTrigger: true`. Consume the NDJSON stream through completion.
4. Once background receipts arrive, run the dashboard's [chat spend query](../../lib/analytics/chat-spend.ts), [engagement queries](../../lib/analytics/engagement.ts) and [feature report](../../lib/analytics/features.ts) against the local database for the run window. Check channel, actor, submissions, completions and priced attempts. A missing provider counter makes spend partial. Keep credentials, conversation references, prompts from real users and raw operation IDs out of reports.

For a deterministic check with synthetic provider responses, run the existing PostgreSQL suites against a migrated `TEST_DATABASE_URL` with the repository's test environment configured. These exercise a timed-out stream, retry, replay, a website-visible reply, and a saved church read through the real MCP route. All 12 tests passed during this check.

```sh
RUN_DATABASE_INTEGRATION_TESTS=1 npm test -- tests/chat-analytics.integration.test.ts tests/analytics-evaluation-costs.integration.test.ts
```
