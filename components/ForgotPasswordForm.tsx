// app/components/ForgotPasswordForm.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { account } from "@/utils/appwrite";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Replace "https://example.com" with your actual domain or route for recovery
      await account.createRecovery(email, "https://example.com/reset-password");
      setMessage("Recovery email sent! Check your inbox.");
    } catch (error: unknown) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("An unknown error occurred.");
        }
      }
      
  };

  return (
    <form onSubmit={handleRecovery}>
      <Card className="mx-auto max-w-sm mt-10">
        <CardHeader>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email to receive a password reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          {message && <p className="text-green-600 mb-4">{message}</p>}
          {errorMessage && <p className="text-red-600 mb-4">{errorMessage}</p>}
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
            <Button type="submit" className="w-full">Send Recovery Email</Button>
            <div className="mt-4 text-center text-sm">
              <Link href="/login" className="underline">
                Back to Login
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
