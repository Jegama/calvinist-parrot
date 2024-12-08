// app/components/Header.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { account } from "@/utils/appwrite";

import { Models } from "appwrite";

type AppwriteUser = Models.User<Models.Preferences>;

export function Header() {
  const [user, setUser] = useState<AppwriteUser | null>(null);

  useEffect(() => {
    // Attempt to fetch the logged-in user
    const getUser = async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
      } catch {
        // Not logged in or error
        setUser(null);
      }
    };
    getUser();
  }, []);

  return (
    <header className="w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">
              Calvinist Parrot
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {/* <Link href="/main-chat">Chat</Link>
            <Link href="/devotionals">Devotionals</Link>
            <Link href="/about">About</Link> */}
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <ThemeToggle />
          {user ? (
            // If logged in, show the user's name linking to profile
            <Link href="/profile">
              <Button variant="outline">{user.name}</Button>
            </Link>
          ) : (
            <>
              {/* If not logged in, show Login and Register */}
              <Link href="/login">
                <Button variant="outline">Login</Button>
              </Link>
              <Link href="/register">
                <Button>Register</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
