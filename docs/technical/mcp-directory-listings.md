# Parrot directory submissions

## Submission record

| Directory | Submission on November 27, 2026 | Receipt or review ID | Review status |
| --- | --- | --- | --- |
| OpenAI | No submission made in this rollout. The public terms URL, reviewer recording, and authenticated client test are outstanding. | None | No review requested |
| Anthropic | No submission made in this rollout. Account memory extraction conflicts with the directory policy described below. | None | No review requested |

The fresh hosted Codex connection returned saved churches and opened one evaluation. After the operator configured the chat secret and redeployed, Codex also received a guest answer with citations to Ephesians 2. The private call issued a sign-in challenge. After production OAuth was enabled, Codex reached Parrot’s sign-in page with the correct issuer, scope, resource and PKCE challenge. A signed-in reviewer still needs to approve consent and exercise a saved question and continuation. [Authorization configuration](./mcp-authorization.md)

Record the actual submission date, portal ID, and subsequent decision in the corresponding row. Direct setup is available independently of the directories. [Connect to Parrot](https://www.calvinistparrot.com/connect)

## Listing fields

| Field | Value |
| --- | --- |
| Display name / package name | Calvinist Parrot / `calvinist-parrot` |
| Publisher | Calvinist Parrot Ministries |
| Subtitle | Bible study and church search |
| Description | Ask a Bible or theology question and read Parrot's answer with citations from a Reformed perspective. Search the public directory by city, state, denomination, or evaluation status and read a church’s saved evaluation with its available sources. Guest questions are stored and isolated. Where account linking is available, authorized questions appear in Parrot history, can update account memories, and support follow-ups. Directory coverage varies by location. |
| Category | Education, if offered by the portal |
| Logo | [Parrot mark](https://www.calvinistparrot.com/Logo.png) |
| Website / setup | [Calvinist Parrot](https://www.calvinistparrot.com/) · [Connect to Parrot](https://www.calvinistparrot.com/connect) |
| Publisher / support | [Calvinist Parrot Ministries](https://www.calvinistparrotministries.org/) · [Support page](https://www.calvinistparrot.com/about) · [Product, security, and privacy contact](mailto:contact@calvinistparrotministries.org) |
| Privacy | [Calvinist Parrot privacy policy](https://www.calvinistparrot.com/privacy-policy) |
| Terms of service | A publisher-approved public HTTPS terms URL for the hosted service is still needed for OpenAI. |
| Endpoint / transport | `https://www.calvinistparrot.com/api/mcp` over Streamable HTTP |
| Authentication | Mixed. Public directory reads and isolated guest chat use anonymous access. Account chat uses OAuth and the `chat.write` scope. |
| Initial release notes | Adds remote access to cited Parrot answers, church directory search, and saved evaluations. |

**Data handled.** The client sends the selected tool's arguments, such as a question, denomination, location filters, request IDs or a conversation reference. It receives the answer and citations or public church records. Parrot persists anonymous turns without a fixed expiry. An authenticated question uses account history and can contribute to that account's profile. Appwrite validates the grant, Neon stores the data, and the configured AI and research providers process chat as described in the privacy policy. A saved directory read incurs no evaluation work. The server records an external retrieval and uses hashed caller identifiers for quota accounting. Deleting an account conversation or revoking a grant and deleting the client's copy are separate controls. [Parrot privacy and retention](https://www.calvinistparrot.com/privacy-policy) · [Authorization and revocation](./mcp-authorization.md)

## Reviewer prompts

Start with these examples. The third prompt follows the directory search. The review cases in the package add the saved conversation, authorized continuation, and three unsupported requests. They describe expected behavior. Attach the dated native-client results to each submission. [Full prompts, tools, and expected results](../../integrations/openai/.codex-plugin/plugin.json)

1. “Ask Parrot what Ephesians 2:8–10 teaches about grace. Include its citations.”
2. “Show two saved, evaluated churches from Parrot’s directory.”
3. “Open the first church’s saved evaluation. Show its status and any supporting links.”

## OpenAI submission

A verified publisher needs an organization owner or a member with **Apps Management Write** for the selected project. Package the listing and one remote MCP connection in the plugin ZIP, choose mixed authentication, and complete the domain challenge. The portal requires a public terms URL in addition to the website, support, and privacy links. Enter the dedicated reviewer login privately. Run the five positive and three negative cases in ChatGPT, supply a reviewer-accessible recording, review the tool scan, then submit and record the receipt. Publication is a separate action after approval. [Submission guide and package fields](https://developers.openai.com/plugins/deploy/submission) · [Plugins dashboard](https://platform.openai.com/plugins)

The draft uses OpenAI's supported Codex package layout. The manifest supplies the listing, five positive and three negative review cases, and release notes. The MCP declaration uses dynamic client registration and the mixed public/OAuth mode. Complete `interface.termsOfServiceURL` and `extensions.com.openai.review.demo_recording_url` with the real public URLs before review. Confirm the category and country availability in the dashboard. [Manifest](../../integrations/openai/.codex-plugin/plugin.json) · [MCP configuration](../../integrations/openai/.mcp.json)

From the repository root, package the two source files and the existing Parrot logo. The ZIP is a local build artifact.

```sh
python3 -m zipfile -c /tmp/calvinist-parrot-directory.zip integrations/openai/.codex-plugin integrations/openai/.mcp.json public/Logo.png
python3 -m zipfile -t /tmp/calvinist-parrot-directory.zip
```

The publisher should review the disclosure of religious preferences and account personalization against the sensitive-data and user-control requirements for its chosen countries before making the submission attestations. [OpenAI plugin guidelines, section 4](https://developers.openai.com/plugins/plugin-guidelines)

## Anthropic submission

Use the single remote connector submission flow on a paid Claude plan. The portal asks the publisher to verify ownership and contact information. Supply the three example prompts above, the privacy and support links, provider privacy policies applicable to the deployment, and private access to a standard sample account. Test the authenticated flow before requesting review. [Directory portal](https://claude.ai/directory/manage/new) · [Submission process](https://claude.com/resources/articles/build-plugins-for-claude) · [Directory policy, sections 3 and 5](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)

**Account memory policy conflict.** Section 1.G prohibits storing or using conversation content to build user profiles. A completed signed-in MCP turn with a nonempty reply can extract spiritual interests and preferences from the conversation and write them to the Parrot account. Isolated guest MCP turns skip extraction. The publisher needs to resolve this behavior with Anthropic or change and retest it before attesting compliance. [Anthropic Software Directory Policy, section 1.G](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) · [Chat handler](../../lib/api/handlers/chat.ts) · [Profile and memory extraction](../../utils/memoryExtraction.ts)
