// app/components/Header.tsx

"use client";

import Link from "next/link";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="app-header sticky top-0 z-50 w-full px-4 py-2">
      <div className="container mx-auto flex h-14 items-center">
        {/* Left side: Logo and Navigation */}
        <div className="flex items-center space-x-2">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-70 transition-opacity">
            <Image
              src="/Logo.png"
              alt="Calvinist Parrot"
              width={50}
              height={50}
              className="h-12 w-auto"
            />
            <span className="app-logo">Calvinist Parrot</span>
          </Link>

          <Separator orientation="vertical" className="header-separator mr-2 h-4" />

          {/* Desktop Navigation (visible on md and above) */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="/devotional" className="hover:opacity-70 transition-opacity">Devotional</Link>
            <Link href="/parrot-qa" className="hover:opacity-70 transition-opacity">Parrot QA</Link>
            <Link href="/prayer-tracker" className="hover:opacity-70 transition-opacity">Prayer Tracker</Link>
            <Link href="/about" className="hover:opacity-70 transition-opacity">About</Link>
          </nav>

          {/* Mobile Dropdown (hidden on md and above) */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:bg-muted/50">More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[8rem]">
                <DropdownMenuItem asChild>
                  <Link href="/devotional" className="w-full">
                    Devotional
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/parrot-qa" className="w-full">
                    Parrot QA
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/prayer-tracker" className="w-full">
                    Prayer Tracker
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/about" className="w-full">
                    About
                  </Link>
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
          {loading ? null : user ? (
            // If logged in, show the user's name linking to profile
            <Link href="/profile">
              <Button variant="outline" className="hover:bg-muted/50">{user.name}</Button>
            </Link>
          ) : (
            <>
              {/* If not logged in, show Login and Register */}
              <Link href="/login">
                <Button variant="outline" className="hover:bg-muted/50">Login</Button>
              </Link>
              <Link href="/register">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90">Register</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
