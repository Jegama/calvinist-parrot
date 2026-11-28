import type { Metadata } from "next";
import Link from "next/link";
import { CopySnippet } from "./copy-snippet";

const endpoint = "https://www.calvinistparrot.com/api/mcp";

export const metadata: Metadata = {
  title: "Connect to Parrot",
  description: "Connect ChatGPT, Codex, or Claude to Calvinist Parrot to ask theological questions and read saved church evaluations.",
  alternates: { canonical: "/connect" },
};

export default function ConnectPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 leading-relaxed sm:px-8 sm:py-12 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-2xl [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Connect to Parrot</h1>
        <p className="text-lg">Ask a theological question with Scripture citations or explore saved church evaluations from your AI client. All three clients use the same hosted MCP server.</p>
        <p className="pt-2 text-sm font-medium">Server URL · Streamable HTTP</p>
        <CopySnippet text={endpoint} label="Copy server URL" />
        <p className="border-l-2 border-accent pl-3 text-sm"><strong>Service check · November 27, 2026.</strong> Codex returned a cited answer to a guest question, found churches and opened a saved evaluation. After sign-in and consent, Codex saved a question to a test account and continued that conversation. You can also ask a question in <Link href="/">Parrot web chat</Link>.</p>
      </header>

      <section>
        <h2>Set up your client</h2>
        <div className="divide-y rounded-xl border bg-card px-5">
          <details className="py-3">
            <summary className="cursor-pointer py-1 font-serif text-xl font-semibold">ChatGPT</summary>
            <div className="space-y-3 py-3">
              <p>On ChatGPT web, Business admins and owners can add a custom server. Enterprise and Edu can also grant members permission to create one. Only admins and owners can publish it for the workspace.</p>
              <ol>
                <li>In Plugins, use the plus button to add a custom MCP server. In the legacy interface, go to Settings → Apps → Create.</li>
                <li>Name it Calvinist Parrot, paste the server URL, and choose no authentication for guest access. Review the warning, create the plugin, and check the discovered tools.</li>
                <li>Install the plugin and select it with @ in a new chat. Approve individual actions when prompted.</li>
              </ol>
              <p>Pro custom connections and deep research allow read/fetch actions. Use the two directory tools there. Asking a question requires a client and workspace that allow writes, even as a guest. <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt">ChatGPT setup and permissions</a></p>
            </div>
          </details>
          <details className="py-3">
            <summary className="cursor-pointer py-1 font-serif text-xl font-semibold">Codex</summary>
            <div className="space-y-3 py-3">
              <p>In a terminal with the Codex CLI installed, add the hosted server. Managed workspaces must allow this MCP server.</p>
              <CopySnippet text={`codex mcp add parrot --url ${endpoint}`} label="Copy Codex setup command" />
              <p>Start a fresh Codex session, type <code>/mcp</code>, and confirm that Parrot’s tools appear. If answers time out, set <code>tool_timeout_sec = 210</code> under <code>[mcp_servers.parrot]</code> in your Codex configuration and restart. <a href="https://developers.openai.com/codex/mcp/">Codex MCP settings</a></p>
            </div>
          </details>
          <details className="py-3">
            <summary className="cursor-pointer py-1 font-serif text-xl font-semibold">Claude</summary>
            <div className="space-y-3 py-3">
              <p>Custom web connectors are available on individual plans, with one custom connector on Free. On Team, an owner adds it under Organization settings → Connectors. Enterprise can also delegate this to a role with permission to manage access to Libraries.</p>
              <ol>
                <li>On Claude web or Desktop, open Customize → Connectors. Choose Add → Custom → Web.</li>
                <li>Name the connector Calvinist Parrot and enter the server URL. Continue to authentication, choose <strong>No sign in</strong> for guest access, then add it.</li>
                <li>Enable Parrot in your chat’s Connectors menu. If your organization allows read-only tools, you can search the directory and open evaluations.</li>
              </ol>
              <p><a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude custom connector setup</a> · <a href="https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities">Claude tool permissions</a></p>
            </div>
          </details>
        </div>
      </section>

      <section className="space-y-3">
        <h2>Try it without a Parrot account</h2>
        <p><strong>Ask a question.</strong> “Ask Parrot what it means to show patience. Include the Scripture references from its answer.” The <code>ask_parrot</code> tool returns the final answer, including its inline citations. Parrot stores the question and reply. Each guest conversation is a single turn with no reusable conversation reference. The guest limit is 10 chat requests per hour per network.</p>
        <p><strong>Find a church.</strong> “Find two evaluated churches in Houston. Open the first saved evaluation and show its supporting links.” The client calls <code>find_churches</code>, then <code>get_church</code> with a returned ID. Both read existing records and incur no new evaluation charge. If a city has no matches, ask for two evaluated churches across the directory.</p>
      </section>

      <section className="space-y-3">
        <h2>Save a conversation to your account</h2>
        <p>For account access, choose OAuth in ChatGPT or the sign-in option in Claude. In Codex, run <code>codex mcp login parrot --scopes chat.write</code>. Sign in on the Parrot consent screen, check the named client and account, and approve <code>chat.write</code>.</p>
        <p>All authorized questions and replies appear in your Parrot account history and can inform your account’s personalized chat memory. The limit is 20 chat requests per minute per account. Ask your client to start a saved conversation, then continue using the returned <code>conversationRef</code> with the same account. Keep that reference private.</p>
      </section>

      <section className="space-y-3">
        <h2>Disconnect</h2>
        <p>Remove Parrot in ChatGPT’s Plugins settings or disconnect it in Claude’s Customize → Connectors. In Codex, run <code>codex mcp logout parrot</code> if signed in, then <code>codex mcp remove parrot</code>.</p>
        <p>Removing the configuration stops the client from calling Parrot. To revoke an existing OAuth grant, use the client’s revocation action if available or <a href="mailto:contact@calvinistparrotministries.org">contact Parrot support</a> with the client name. Saved conversations remain in your account until you delete them in the chat sidebar. <Link href="/privacy-policy">Privacy policy</Link></p>
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2>Compare churches from code</h2>
        <p>In a sandbox with Node.js 24 and network access, run the example from the repository root. It reads the public v1 directory and prints a compact comparison by city.</p>
        <CopySnippet text="node scripts/examples/compare-churches.mjs" label="Copy example command" />
        <p><a href="https://github.com/Jegama/calvinist-parrot/blob/master/scripts/examples/compare-churches.mjs">View the runnable example</a> · <Link href="/api/v1/docs">Public API reference</Link></p>
      </section>
    </main>
  );
}
