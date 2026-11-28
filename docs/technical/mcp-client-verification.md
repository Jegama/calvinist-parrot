# Hosted Parrot client verification

On November 27, 2026 (America/Chicago), we tested `https://www.calvinistparrot.com/api/mcp` against the production revision `3a1fd2e`. The [setup guide](../../app/connect/page.tsx), [local HTTP and analytics check](mcp-analytics-check.md), and [directory submission record](mcp-directory-listings.md) have separate verification scopes.

| Client | Fresh setup and observed outcome |
| --- | --- |
| Codex CLI 0.172.0-alpha.2 | Added `parrot` with the published command in an empty client configuration. The Codex app server discovered all three tools. Through its native `mcpServer/tool/call`, a guest received a two-sentence answer citing Ephesians 2:8–10, Romans 3:27–28, Titus 3:5, Galatians 5:6 and James 2:17. It returned no `conversationRef`. Codex listed evaluated churches in three cities and opened the saved evaluation for Christ the King Presbyterian Church in Houston, with four supporting links. |
| ChatGPT web | This environment displayed “Domain forbidden” before the connector setup screen. Setup, tool permissions, citations and account continuation in the native UI remain unverified. |
| Claude web | This environment returned `ERR_TUNNEL_CONNECTION_FAILED` before the connector setup screen. Setup, tool permissions, citations and account continuation in the native UI remain unverified. |

The initial guest question failed before a conversation or provider attempt was created. After adding the missing production-only `MCP_SECRET` and redeploying the same revision, retrying the original question and UUID succeeded. The private call issued an authentication challenge. The first `codex mcp login parrot --scopes chat.write` stopped at issuer validation. Production advertised the custom-domain Appwrite issuer, discovery reported the regional issuer and an empty scope list, and the Appwrite project had its OAuth server disabled. After enabling OAuth in Appwrite and redeploying the same production revision with the matching regional issuer, Parrot and Appwrite advertised the same issuer and the `chat.write` scope. A fresh Codex login requested `chat.write` explicitly with S256 PKCE and the canonical MCP resource. The authorization endpoint redirected the client to Parrot’s signed-out consent page (HTTP 200). Public tool discovery returned all three tools, and an invalid test bearer returned HTTP 401 with the resource metadata challenge. See the [authorization guide](mcp-authorization.md).

A dedicated, unprivileged production test account then approved the Codex grant. Codex exchanged the code for tokens, saved a question on James 1:19 in 14.77 seconds and returned a conversation reference. A second call used that reference to ask how to practice the teaching during a disagreement. It returned a cited answer in 10.51 seconds (Proverbs 18:13 and James 1:19–20). An authenticated read of the original chat contained both submitted questions and both exact returned replies. After the test, Appwrite accepted revocation of the temporary refresh and access tokens. The same access token went from HTTP 200 to HTTP 401 on the MCP endpoint, and Codex logged out. The account and its two-turn chat remain in production analytics.

## Directory comparison

Use Node.js 24 from the repository root to reproduce the compact output.

```sh
node scripts/examples/compare-churches.mjs
```

We compared the three Codex `find_churches` results with `/api/v1/churches` using identical city, state, page and page-size inputs. The complete ordered JSON bodies matched, including every ID, label, evaluation status and `hasMore: false`. A detail call through each channel also matched field for field, including the saved evaluation and its links. These counts are a snapshot of the evaluated directory.

| City | Evaluated | Recommended | Historic confession |
| --- | ---: | ---: | ---: |
| Bellevue, WA | 1 | 1 | 0 |
| Houston, TX | 12 | 6 | 1 |
| Sunnyvale, CA | 2 | 2 | 1 |

Three sequential Codex search calls took 2.051 seconds after discovery. Their text fields contained 3,701 UTF-8 bytes. MCP also returns the same data in `structuredContent`. The [runnable example](../../scripts/examples/compare-churches.mjs) read 3,701 uncompressed HTTP-body bytes in 1.896 seconds and returned 528 bytes of Markdown, including one saved-record link per city. Passing only the table to a model reduced the data presented by 86%. Bytes measure the content supplied to the model. Client token use depends on serialization and tokenizer. These single-run timings include network overhead. The two paths read existing evaluations, and neither invoked a new evaluation. The compact example meets this task without a dedicated CLI or skill.

## Guest chat and production analytics

Both channels received the same question about grace, faith and good works in Ephesians 2:8–10. Both answers cited the passage, identified grace as the source, faith as the means of receiving salvation, and good works as its fruit. They used different supporting verses. The direct v1 client kept its guest cookie across chat creation, the streamed message and the transcript read.

| Hosted path | Time to answer | Final answer UTF-8 bytes | Priced attempts | Estimated Parrot spend |
| --- | ---: | ---: | ---: | ---: |
| Codex `ask_parrot` | 8.922 s | 503 | 1 of 1 | $0.02093850 |
| Direct v1 create and stream | 23.054 s | 524 | 5 of 5 | $0.05557788 |

The Codex timing begins after discovery. The direct v1 timing includes creation and the stream through completion. Its stream body contained 3,243 bytes including progress. An additional transcript check confirmed the saved reply. These are individual production observations with different model work per turn. Latency and spend will vary with the question, tool calls and provider.

The production checks used only the two test turns and hashed retrieval operations. Each channel recorded one saved church retrieval, including the repeated MCP detail call. Neither appeared as a website engagement step. No new evaluation for that church was recorded within a minute of either retrieval, and there were zero associated evaluation attempts. The [local isolated check](mcp-analytics-check.md) also verified unchanged evaluation counts and zero evaluation spend by channel. Both channels recorded exactly one guest-created chat, one genuine submission, one reply and zero linked website chat steps. Codex’s turn had one priced Gemini agent call (6,424 input and 1,507 output tokens). The v1 turn included three Gemini agent calls, a Gemini title and GPT memory extraction (24,645 input and 2,353 output tokens combined). All six attempts had provider counters and a price. Neither channel recorded a paid retry. The initial failed guest call added no duplicate.
