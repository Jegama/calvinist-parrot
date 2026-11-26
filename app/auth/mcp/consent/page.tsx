import { stringify } from "node:querystring";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadConsent } from "@/lib/mcp/auth-consent";
import { consentAuthHref } from "@/lib/mcp/auth-return";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect to Calvinist Parrot", robots: { index: false, follow: false } };

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const consent = await loadConsent(params);
  if (consent.state === "redirect") redirect(consent.url);
  return (
    <main className="flex min-h-[calc(100vh-var(--app-header-height))] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="font-serif text-2xl">Connect to Calvinist Parrot</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {consent.state === "disabled" && <p>Account connections are unavailable on this server.</p>}
          {consent.state === "invalid" && <p>This authorization request has expired or is unsupported. Start a new connection from your MCP client.</p>}
          {consent.state === "signedOut" && <>
            <p>Sign in to review which client is requesting access to your saved Parrot conversations.</p>
            <Button asChild><Link href={consentAuthHref("/login", stringify(params))}>Sign in to review request</Link></Button>
          </>}
          {consent.state === "grant" && <>
            <p><strong>{consent.client}</strong> ({consent.callbackHost}) is requesting access as <strong>{consent.account}</strong>.</p>
            <p>This client can send questions and save answers to your Parrot account. It can continue conversations when it has their references and renew access while you are away.</p>
            {consent.scopes.includes("openid") && <p>The client can identify your Parrot account.</p>}
            <form method="post" action="/auth/mcp/consent/decision" className="flex flex-wrap gap-3">
              <input type="hidden" name="grant_id" value={consent.id} />
              <Button type="submit" name="decision" value="allow">Allow access</Button>
              <Button type="submit" variant="outline" name="decision" value="deny">Deny access</Button>
            </form>
          </>}
        </CardContent>
      </Card>
    </main>
  );
}
