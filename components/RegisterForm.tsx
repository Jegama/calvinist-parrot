// app/components/RegisterForm.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { account, ID } from "@/utils/appwrite";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Use cookie-based ID if available, otherwise generate one.
      const getCookieUserId = () => {
        const match = document.cookie.match(new RegExp('(^| )userId=([^;]+)'));
        return match ? match[2] : null;
      };
      let uniqueId = getCookieUserId();
      if (!uniqueId) {
        uniqueId = ID.unique();
        document.cookie = `userId=${uniqueId}; path=/; max-age=31536000`;
      }
      await account.create(uniqueId, email, password, name);
      // Optionally log them in automatically
      await account.createEmailPasswordSession(email, password);
      window.location.href = "/";
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unknown error occurred.");
      }
    }      
  };

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
          {errorMessage && <p className="text-red-600 mb-4">{errorMessage}</p>}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Register
            </Button>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/login" className="underline">
                Login
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
