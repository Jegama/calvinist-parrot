# MCP account authorization

Directory tools are public. The private `ask_parrot` path uses an Appwrite user grant with the `chat.write` permission. It saves the question and answer to that account and allows continuation with a conversation reference. The resource server checks the bearer token with Appwrite on each request. Appwrite session cookies are used only for the website's sign-in and consent screens. [Appwrite OAuth2 server](https://appwrite.io/docs/products/auth/oauth-server) · [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

## Appwrite project configuration

1. Set `APP_URL` to the canonical HTTPS Parrot origin and `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` to the same project used for Parrot sign-in. The default issuer is `<APPWRITE_ENDPOINT>/oauth2/<APPWRITE_PROJECT_ID>`. If the website uses a custom Appwrite API domain, set `MCP_APPWRITE_ISSUER` to the exact `issuer` from the project’s OAuth discovery document and retain the website endpoint. Verify the discovery document advertises code flow and `S256`. Local development accepts HTTP on loopback.
2. In Appwrite **Auth → OAuth2 server → Server**, enable the OAuth2 server. Use `<APP_URL>/auth/mcp/consent` as its Authorization URL. Add `chat.write` as a custom user scope. Enable **Require PKCE** for confidential clients. Public clients already require `S256`. Scope the client to Parrot chat and use the canonical `<APP_URL>/api/mcp` resource in both authorization and token requests. [Appwrite authorization](https://appwrite.io/docs/products/auth/oauth-server/authorization)
3. For each client, use its supported registration method. For a preregistered client, register the callback URI that the client displays. Use a public client for an installed CLI that cannot store a secret. The consent screen supports HTTPS callbacks and the HTTP loopback callback used by native clients.
4. Create a dedicated server-side API key with the `oauth2.introspect` permission. Set `MCP_APPWRITE_INTROSPECTION_KEY` in this deployment. A blank key disables account linking. `GET /.well-known/oauth-protected-resource/api/mcp` should now publish the canonical resource, the project issuer and the `chat.write` scope.

For an isolated Vercel Preview, set both `APPWRITE_ENDPOINT` and `NEXT_PUBLIC_APPWRITE_ENDPOINT` to the preview project's API endpoint, and both `APPWRITE_PROJECT_ID` and `NEXT_PUBLIC_APPWRITE_PROJECT_ID` to its project ID. Scope these variables and the server keys to the preview branch. Email sign-in and MCP account linking use two Appwrite keys from that project. Username sign-in and registration analytics use a third key.

| Server variable | Appwrite API key scope | Purpose |
| --- | --- | --- |
| `APPWRITE_API_KEY` | `sessions.write` | Create the website session used for consent |
| `MCP_APPWRITE_INTROSPECTION_KEY` | `oauth2.introspect` | Validate the client's MCP access token |
| `APPWRITE_ANALYTICS_READ_KEY` | `users.read` | Resolve a username to its Appwrite email and read registration counts |

Generate `MCP_SECRET` separately as a stable random secret of at least 32 bytes for MCP chat identifiers.

The consent page reads and decides the pending grant through the signed-in user's session. It shows the client, return host, signed-in account and permissions. Its Allow and Deny actions require a same-origin form submission. On the MCP endpoint, introspection checks the active access token, issuer, resource audience, subject, expiry and permission. Tokens with a different resource receive HTTP 401. Missing `chat.write` returns HTTP 403. An introspection outage returns HTTP 503. The next authenticated request detects a revoked grant or rotated token. [Appwrite token introspection and revocation](https://appwrite.io/docs/products/auth/oauth-server/tokens)

### Shared production and preview identity

Appwrite configures one Authorization URL, custom scope set and confidential-client PKCE policy per project. A separate MCP client registration controls where that client receives its code. Its callback setting cannot select the preview consent page. Production uses `APP_URL` for resource metadata, consent, token audience and form origins. A Vercel Preview uses the HTTPS host in `VERCEL_BRANCH_URL`, falling back to `VERCEL_URL`. Use that hostname for the preview MCP connection and consent page. Preview refuses private authorization if both Vercel host variables are absent and ignores inherited `APP_URL`. A production-only token fails at preview, even when both use the same issuer. [Appwrite quick start](https://appwrite.io/docs/products/auth/oauth-server/quick-start) · [Client registration](https://appwrite.io/docs/products/auth/oauth-server/clients)

On November 25, 2026, the connected Calvinist Parrot project reported that the OAuth2 server was disabled, the Authorization URL and custom scope list were empty, and the confidential-client PKCE setting was off. Its discovery document, fetched through the custom API domain, advertised the regional `fra.cloud.appwrite.io` issuer, authorization codes, S256, introspection, revocation and client registration. It did not advertise `chat.write`. For this deployment, use the regional issuer with `MCP_APPWRITE_ISSUER`. A live private connection needs project-level enablement.

If preview shares the production Appwrite project, retain its existing project settings during preview testing. A full live client flow requires the project's configured consent URL to support the exact preview resource. This implementation accepts grants only for its own deployment. Repointing the shared consent URL to an individual preview affects all clients using that project. Use a separately configured nonproduction project for an independent full-flow test, or exercise preview against the local fixtures and record live authorization as pending. Public directory reads and isolated guest questions can use preview without changing Appwrite OAuth.

## Client verification

See the [dated hosted client results](mcp-client-verification.md) for production Codex guest chat, saved directory reads and account-link status. [Directory submission records](mcp-directory-listings.md) track publisher review separately.

Use two test accounts and a new connection in each target client. Run against the selected nonproduction deployment. Record the client version, date and outcome in the onboarding handoff. The automated repository tests use Appwrite-shaped fixtures for consent, access tokens and revocation. Codex CLI 0.167.0-alpha.4 also exercised discovery, dynamic registration, the consent callback and the token request against a local test issuer. That issuer verified the PKCE verifier and MCP resource, then stopped before credential issuance. Hosted compatibility requires a configured OAuth project and a reachable HTTPS deployment.

| Client | Connection and sign-in check |
| --- | --- |
| ChatGPT | Add the HTTPS MCP URL as an OAuth-capable connector. Verify public reads first, then trigger the account-link prompt on a saved continuation. Confirm it returns to the connector after consent. [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth) |
| Codex | Run `codex mcp add parrot --url <APP_URL>/api/mcp`. Test a public read, then `codex mcp login parrot --scopes chat.write` and complete browser consent. Verify the loopback callback returns control to the CLI. [Codex MCP](https://developers.openai.com/codex/mcp/) |
| Claude | Add the HTTPS MCP URL in custom connectors. For preregistration, use Claude's displayed redirect URI and enter the registered client details. Verify the approval returns to the connector. [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |

For each client, send a guest question and confirm no reusable account reference is returned. Search for a saved church, read its details, and repeat an empty search. Sign in as the first account and deny one request. Restart and approve a fresh request. Save a new question, then send a follow-up with its reference and check the original citations. Repeat from the second account and verify that the first account's reference is inaccessible. Finally, revoke the access or refresh token at Appwrite's revocation endpoint and retry a private call with the old token. Expect HTTP 401 and a new authorization challenge. Removing a client configuration alone does not establish token revocation. [Client onboarding issue](https://github.com/Jegama/calvinist-parrot/issues/107)
