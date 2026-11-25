# Changelog

## Unreleased

- **Feature engagement.** Analytics administrators can see how often a chat reaches a follow-up, a devotional holds a reader’s attention, or a generated report is opened. The feature table includes matched website steps, coverage dates, and separate API and MCP outcomes. [#124](https://github.com/Jegama/calvinist-parrot/pull/124)
- **Chat costs and dashboard history.** Admins can see estimated chat spend per completed turn by channel, inspect retry and stage costs, and view all-time totals and cumulative growth. Dashboard reports refresh at Chicago midnight or on demand. [#122](https://github.com/Jegama/calvinist-parrot/pull/122)
- **Admin analytics.** Accounts with the `analyticsadmin` label can open the dashboard from their profile to track chat and account growth on daily line charts and view guest activity, activation, feature usage, and estimated AI spend over periods from seven days to two years. [#121](https://github.com/Jegama/calvinist-parrot/pull/121)
- **Form visibility.** Light-mode fields have clearer outlines and keyboard focus. Prayer Tracker’s family directory has a larger mobile search field with a search icon. [#121](https://github.com/Jegama/calvinist-parrot/pull/121)

## 2.0.0 — November 24, 2026

### Breaking change for Q&A integrations

- Counsel of Three retired on October 31, 2026. `/api/v1/qa`, `/api/parrot-qa`, and `/api/elaborate` now return HTTP 410 Gone. To ask a new question, create a conversation with `POST /api/v1/chats`, then send the question to `POST /api/v1/chats/{chatId}/messages` using the same session or guest cookie. Previously saved answers remain in question history. The separate `/api/parrot-chat` adapter is still available and deprecated. [Chat migration guide](https://www.calvinistparrot.com/documentation-parrot-chat) · [#84](https://github.com/Jegama/calvinist-parrot/pull/84)

### Features and changes

- **Church Finder.** Evaluations can use quotations in the original language of a church website. The results distinguish what a congregation states directly, what it affirms by publicly adopting a confession, and what can be established about its current affiliations. Time limits on website retrieval give submitters a clear failure when a site cannot be evaluated. [#81](https://github.com/Jegama/calvinist-parrot/pull/81) · [#84](https://github.com/Jegama/calvinist-parrot/pull/84)
- **Sermon evaluation.** Invited users can privately upload a recording, follow its evaluation, read rubric-based feedback, compare trends across sermons, and download reports. [#82](https://github.com/Jegama/calvinist-parrot/pull/82)
- **Chat and model evaluations.** Claude Haiku 5.5 became the default chat model. Operators switching an existing deployment need an Anthropic API key and `PARROT_AGENT_PROVIDER=anthropic`. The public evaluation dashboard shows which models all three judges reviewed in the provisional November edition and preserves earlier scores. Gemini 4 Hydrogen became the default for Church Finder and sermon analysis. [Chat model configuration](./README.md#chat-model-configuration) · [#84](https://github.com/Jegama/calvinist-parrot/pull/84) · [#93](https://github.com/Jegama/calvinist-parrot/pull/93)
- **Personal and Heritage Journals.** People can retry an incomplete reflection and keep the stages that succeeded. Both journals now use Claude Haiku 5.5, and the privacy policy explains which journal text and parent-entered information is sent to Anthropic. [#83](https://github.com/Jegama/calvinist-parrot/pull/83) · [#101](https://github.com/Jegama/calvinist-parrot/pull/101)
- **Prayer Tracker.** Rotations give priority to families with no recorded prayer, then those who have waited longest, and minimize repeat assignments within each member's capacity. Families are searchable when creating or editing a request and in the family directory. A request keeps its family link if that family is archived. [#92](https://github.com/Jegama/calvinist-parrot/pull/92) · [#95](https://github.com/Jegama/calvinist-parrot/pull/95)

### Fixes and security

- Chat typing and streaming require less redrawing. A smaller header and composer leave more of the conversation visible on phones and in split-screen windows. [#85](https://github.com/Jegama/calvinist-parrot/pull/85) · [#86](https://github.com/Jegama/calvinist-parrot/pull/86)
- Idle sermon workers poll less often. Reports can finish on a read-only worker, and a retry can reuse the extraction and scores already saved. [#85](https://github.com/Jegama/calvinist-parrot/pull/85) · [#90](https://github.com/Jegama/calvinist-parrot/pull/90)
- Updated web and sermon-worker dependencies to address known security advisories and added recurring dependency audits. [Audit record](./docs/technical/2026-11-23-dependency-audit.md) · [#109](https://github.com/Jegama/calvinist-parrot/pull/109)

### Maintenance

- Ten Dependabot PRs updated the web and sermon-worker dependencies, including Appwrite clients, UI components, and Python libraries. [Dependency PRs #110–119](https://github.com/Jegama/calvinist-parrot/pulls?q=is%3Apr+is%3Amerged+author%3Aapp%2Fdependabot+merged%3A2026-11-24)

## 1.0.0 — July 26, 2026

- Integrators gained a documented API for creating chats, reading transcripts, streaming messages, and stopping a request. Chat clients retain the session or guest cookie between requests. This version also introduced `/api/v1/qa` and marked the older chat and Q&A routes deprecated. See the retirement notice above for the subsequent Q&A change. [Interactive API reference](https://www.calvinistparrot.com/api/v1/docs) · [#79](https://github.com/Jegama/calvinist-parrot/pull/79)

## 0.9.0 — July 25, 2026

- Chat gained the ability to edit an earlier message into a new conversation while preserving the original, and to copy an answer formatted for Word, as Markdown, or as plain text. Sources and tool activity stay with the answer they produced. The updated chat resolves identity from cookies, so external callers relying on a supplied user ID need to retain a separate session per user. [#77](https://github.com/Jegama/calvinist-parrot/pull/77) · [#79](https://github.com/Jegama/calvinist-parrot/pull/79)
- On July 26, before the 1.0.0 merge, Church Finder began requiring source quotations for doctrinal claims and stronger evidence for a Recommended rating. Unsupported claims are marked unknown. [#78](https://github.com/Jegama/calvinist-parrot/pull/78)

## 0.8.0 — May 24, 2026

- The public model dashboard added May results and comparisons by category. Chat began checking book titles and authors against search results before recommending them. [#67](https://github.com/Jegama/calvinist-parrot/pull/67)
- Later that day, Prayer Tracker began refreshing shared prayer data when another household member made a change. In July the model dashboard added judge agreement, calibration, and uncertainty alongside scores. [#68](https://github.com/Jegama/calvinist-parrot/pull/68) · [#73](https://github.com/Jegama/calvinist-parrot/pull/73)

## 0.7.0 — May 2, 2026

- Sign-in moved to server-managed sessions. Guests could carry conversations into their account when signing in, and signing out cleared private data cached in the browser. [#66](https://github.com/Jegama/calvinist-parrot/pull/66)

## 0.6.1 — February 3, 2026

- Kids Discipleship introduced annual plans, monthly reviews, and Heritage Journal entries to help parents follow up on prayer and discipleship over time. Recent Focus brought recurring themes from Personal Journal entries together. [#59](https://github.com/Jegama/calvinist-parrot/pull/59)
- Later in February, chat started showing progress sooner, incomplete journal analyses retained partial results, and the public model dashboard gained a second evaluation framework and new model comparisons. [#60](https://github.com/Jegama/calvinist-parrot/pull/60) · [#61](https://github.com/Jegama/calvinist-parrot/pull/61) · [#62](https://github.com/Jegama/calvinist-parrot/pull/62)
- In March, chat gained Bible cross-references, additional Study Bible tools when configured, and improved verse parsing. A notice explains the default Reformed Baptist perspective and how to choose another denomination. [#63](https://github.com/Jegama/calvinist-parrot/pull/63) · [#64](https://github.com/Jegama/calvinist-parrot/pull/64)

## 0.6.0 — January 23, 2026

- Personal Journal introduced Scripture-grounded reflections, follow-up conversations, and suggested prayer requests. Household profiles gained support for birthdays. The following day, mobile users gained home-screen shortcuts to Journal, Devotional, Prayer Tracker, and Church Finder. [#57](https://github.com/Jegama/calvinist-parrot/pull/57) · [#58](https://github.com/Jegama/calvinist-parrot/pull/58)

## 0.5.2 — December 8, 2025

- Added home-screen installation support for iOS and Android and let households set how many families each member prays for in a rotation. [#54](https://github.com/Jegama/calvinist-parrot/pull/54)
- On December 19, Church Finder improved retrieval of belief statements from difficult-to-crawl sites and refined its handling of Baptist statements of faith. Administrators gained a way to remove a church listing. [#55](https://github.com/Jegama/calvinist-parrot/pull/55) · [#56](https://github.com/Jegama/calvinist-parrot/pull/56)

## 0.5.1 — December 5, 2025

- The first public model evaluation dashboard made it possible to compare theological responses across models. Chat regained access to historical Christian writings through the Christian Classics Ethereal Library and began showing more detail about the tools used for an answer. [#52](https://github.com/Jegama/calvinist-parrot/pull/52)
- Prayer Tracker made it easier to manage families and requests, and the app received a Next.js security update. [#52](https://github.com/Jegama/calvinist-parrot/pull/52)

## Earlier public announcements

- **November 12, 2025 · v0.5.** Chat gained long-term memory, a denomination selector in the interface, and the ability to delete chats. The announcement also pointed readers to the doctrinal statement and API documentation. [#51](https://github.com/Jegama/calvinist-parrot/pull/51)
- **October 31, 2025 · Church Finder.** The Reformation Day announcement invited people to find or submit a church and see how its website described its beliefs. The directory distinguished limited published information from an explicit doctrinal denial. The initial directory merged on October 29 with package version `0.4`. [#48](https://github.com/Jegama/calvinist-parrot/pull/48) · [#50](https://github.com/Jegama/calvinist-parrot/pull/50)

## Earlier package versions

| Version | First recorded on `master` | Milestone |
| --- | --- | --- |
| 0.3.1 | October 23, 2025 | Improved chat and profile caching and kept household profiles in sync when a prayer request was marked answered. [#47](https://github.com/Jegama/calvinist-parrot/pull/47) |
| 0.3.0 | October 12, 2025 | Introduced the household Prayer Tracker, including family prayer rotation and invitations. [#42](https://github.com/Jegama/calvinist-parrot/pull/42) |
| 0.2.0 | October 3, 2025 | Chat moved to GPT-5 and improved how it handled the first question in a conversation. [#39](https://github.com/Jegama/calvinist-parrot/pull/39) |
| 0.1.0 | November 22, 2024 | First version recorded in the application manifest. [Initial package](https://github.com/Jegama/calvinist-parrot/blob/ff0c2dd/package.json) |

## Historical sources

The backfill covers 45 PRs closed from November 24, 2025 through November 24, 2026. Of those, 44 merged into `master`. The header-layout proposal closed without merging. The earlier public announcements come from the maintainer's Facebook posts. [Closed PRs in the review window](https://github.com/Jegama/calvinist-parrot/pulls?q=is%3Apr+is%3Aclosed+closed%3A2025-11-24..2026-11-24) · [#53](https://github.com/Jegama/calvinist-parrot/pull/53)

Package dates through 1.0.0 mark the first commit carrying that version on `master`, in U.S. Central time. The two public announcements carry their original dates. Later changes under the same number are identified separately. Version 2.0.0 groups the 23 PRs merged after 1.0.0 through November 24, 2026. [Package history](https://github.com/Jegama/calvinist-parrot/commits/master/package.json)

Contributor work in the review included local Postgres and CI setup, Codex environment setup, and a PR review skill. [#70](https://github.com/Jegama/calvinist-parrot/pull/70) · [#71](https://github.com/Jegama/calvinist-parrot/pull/71) · [#91](https://github.com/Jegama/calvinist-parrot/pull/91)
