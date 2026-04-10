// components/LoginForm.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

type LoginResponse = {
  error?: string;
  user?: Parameters<ReturnType<typeof useAuth>["setUser"]>[0];
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();

  useEffect(() => {
    if (searchParams.get("oauth") === "failed") {
      setErrorMessage("Google sign-in failed. Please try again.");
      return;
    }

    if (searchParams.get("oauth") === "missing_credentials") {
      setErrorMessage("Google sign-in could not be completed.");
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as LoginResponse;

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Login failed.");
      }

      setUser(payload.user);
      router.push("/");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unknown error occurred.");
      }
    }    
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/oauth/google/start?intent=login";
  };

  return (
    <form onSubmit={handleLogin}>
      <Card className="mx-auto max-w-sm mt-10">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email and password to login to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && <p className="text-destructive mb-4">{errorMessage}</p>}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="ml-auto inline-block text-sm underline">
                  Forgot your password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">Login</Button>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continue with Google
            </Button>
          </div>
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="underline">
              Sign up
            </Link>
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">
            <Link href="/privacy-policy" className="underline">
              Privacy Policy
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
