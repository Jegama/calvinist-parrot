// app/components/RegisterForm.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProfileIdentityFields } from "@/components/ProfileIdentityFields";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, type AuthResponse } from "@/hooks/use-auth";
import { afterLoginPath, consentAuthHref, rememberConsentRequest } from "@/lib/mcp/auth-return";

export function RegisterForm() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const consentQuery = searchParams.get("mcpConsent");
  const { user, setUser, verificationEmailSent, updateCredentials } = useAuth();

  useEffect(() => {
    rememberConsentRequest(consentQuery);
    if (searchParams.get("oauth") === "failed") {
      setErrorMessage("Google signup failed. Please try again.");
      return;
    }

    if (searchParams.get("oauth") === "missing_credentials") {
      setErrorMessage("Google signup could not be completed.");
    }
  }, [consentQuery, searchParams]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    const fields = new FormData(e.currentTarget);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields)),
      });

      const payload = (await response.json()) as AuthResponse;

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Registration failed.");
      }

      setUser(payload.user, payload.profile, payload.verificationEmailSent);
      if (payload.user.emailVerification) router.push(afterLoginPath(consentQuery));
      else setRegisteredEmail(payload.user.email);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unknown error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = () => {
    window.location.href = "/api/auth/oauth/google/start?intent=signup";
  };

  if (registeredEmail) {
    const sendVerification = async () => {
      setSubmitting(true);
      setErrorMessage("");
      setVerificationMessage("");
      try {
        const response = await fetch("/api/auth/verification", { method: "POST" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not send the verification email.");
        if (user) updateCredentials(user.$id, result);
        setVerificationMessage(result.message);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not send the verification email.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Card className="mx-auto mt-10 max-w-sm">
        <CardHeader>
          <CardTitle>Your account is ready</CardTitle>
          <CardDescription>{user?.emailVerification ? "You can continue to Parrot." : "You can continue to Parrot while you verify your email."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {errorMessage && <p role="alert" className="text-destructive">{errorMessage}</p>}
          {!errorMessage && <p role="status">{verificationMessage || (verificationEmailSent
            ? `Check ${registeredEmail} for your verification link.`
            : `We couldn’t send a verification link to ${registeredEmail}. You can try again here or in Profile.`)}</p>}
          {!user?.emailVerification && (
            <Button type="button" variant="outline" disabled={submitting} onClick={sendVerification}>
              {submitting ? "Sending…" : verificationEmailSent ? "Resend verification email" : "Send verification email"}
            </Button>
          )}
          <Button type="button" onClick={() => router.push(afterLoginPath(consentQuery))}>Continue to Parrot</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleRegister}>
      <Card className="mx-auto max-w-sm mt-10">
        <CardHeader>
          <CardTitle className="text-2xl">Register</CardTitle>
          <CardDescription>
            Create a new account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && <p role="alert" className="text-destructive mb-4">{errorMessage}</p>}
          <div className="grid gap-4">
            <ProfileIdentityFields />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Registering…" : "Register"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignup}>
              Sign up with Google
            </Button>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href={consentAuthHref("/login", consentQuery)} className="underline">
                Login
              </Link>
            </div>
            <div className="mt-2 text-center text-xs text-muted-foreground">
              By registering, you agree to our{" "}
              <Link href="/privacy-policy" className="underline">
                Privacy Policy
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
