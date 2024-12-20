// app/components/Header.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { account } from "@/utils/appwrite";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "appwrite";

type AppwriteUser = Models.User<Models.Preferences>;

export function Header() {
  const [user, setUser] = useState<AppwriteUser | null>(null);

  useEffect(() => {
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
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
      <div className="container mx-auto flex h-14 items-center">
        {/* Left side: Logo and Navigation */}
        <div className="flex items-center space-x-2">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold">Calvinist Parrot</span>
          </Link>

          {/* Desktop Navigation (visible on md and above) */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="/main-chat">Parrot Chat</Link>
            {/* <Link href="/devotionals">Devotionals</Link> */}
            <Link href="/about">About</Link>
          </nav>

          {/* Mobile Dropdown (hidden on md and above) */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <DropdownMenuLabel>More</DropdownMenuLabel>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <Link href="/main-chat">Parrot Chat</Link>
                </DropdownMenuItem>
                {/* <DropdownMenuItem>
                  <Link href="/devotionals">Devotionals</Link>
                </DropdownMenuItem> */}
                <DropdownMenuItem>
                  <Link href="/about">About</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Spacer to push the right side to the opposite end */}
        <div className="flex-1" />

        {/* Right side: Theme toggle and user session actions */}
        <div className="flex items-center space-x-2">
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
