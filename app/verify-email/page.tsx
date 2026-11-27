"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VerifyEmailForm() {
  const { refresh } = useAuth();
  const params = useSearchParams();
  const userId = params.get("userId");
  const secret = params.get("secret");
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, secret }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not verify your email.");
      setVerified(true);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not verify your email.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto mt-10 w-full max-w-md px-4">
      <Card>
        <CardHeader><CardTitle>Verify your email</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {verified ? <p role="status">Your email has been verified.</p> : userId && secret ? (
            <form onSubmit={confirm} className="grid gap-4">
              <p>Confirm that this email address belongs to you.</p>
              {error && <p role="alert" className="text-destructive">{error}</p>}
              <Button disabled={pending}>{pending ? "Verifying…" : "Verify email"}</Button>
            </form>
          ) : <p role="alert">This verification link is incomplete. Request a new one in Profile.</p>}
          <Link href="/profile" className="underline">Go to Profile</Link>
        </CardContent>
      </Card>
    </main>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyEmailForm /></Suspense>;
}
