"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export function AccountCredentials() {
  const { user, verificationEmailSent, updateCredentials } = useAuth();
  const [field, setField] = useState<"email" | "password" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!user) return null;
  const hasPassword = Boolean(user.passwordUpdate);

  function edit(next: typeof field) {
    setMessage("");
    setError("");
    setField(next);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!user || busy) return;
    const fields = event ? new FormData(event.currentTarget) : null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = fields
        ? await fetch("/api/auth/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, ...Object.fromEntries(fields) }),
        })
        : await fetch("/api/auth/verification", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again.");
      updateCredentials(user.$id, result);
      setMessage(result.message);
      setField(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Account settings are temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 border-t pt-4" aria-label="Email and password">
      <div>
        <p>{user.email}</p>
        <p className="text-sm text-muted-foreground">
          {user.emailVerification ? "Email verified" : "Email unverified"}
          {!user.emailVerification && verificationEmailSent && !message && !error && " · Check your inbox for a verification link."}
        </p>
      </div>
      {field ? (
        <form key={field} onSubmit={submit}>
          <fieldset disabled={busy} className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="new-credential">{field === "email" ? "New email" : "New password"}</Label>
              <Input id="new-credential" type={field} name={field} autoComplete={field === "email" ? "email" : "new-password"}
                minLength={field === "password" ? 8 : undefined} maxLength={field === "password" ? 256 : 320} required />
            </div>
            {(field === "email" || hasPassword) && (
              <div className="grid gap-1">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" name="currentPassword" autoComplete="current-password" maxLength={256} required />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{busy ? "Saving…" : field === "email" ? "Save email" : "Save password"}</Button>
              <Button type="button" variant="outline" onClick={() => edit(null)}>Cancel</Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="grid gap-2">
          {!hasPassword && <p className="text-sm">Set a password to change your email or sign in with a password.</p>}
          <div className="flex flex-wrap gap-2">
            {hasPassword && <Button variant="outline" disabled={busy} onClick={() => edit("email")}>Change email</Button>}
            <Button variant="outline" disabled={busy} onClick={() => edit("password")}>
              {hasPassword ? "Change password" : "Set password"}
            </Button>
            {!user.emailVerification && (
              <Button variant="outline" disabled={busy} onClick={() => void submit()}>
                {verificationEmailSent ? "Resend verification email" : "Send verification email"}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
