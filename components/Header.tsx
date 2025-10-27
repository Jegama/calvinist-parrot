// app/components/Header.tsx

"use client";

import { useEffect, useRef, useState } from "react";
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
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrolledRef = useRef<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      // Shrink header when scrolled down more than 50px
      const scrolled = window.scrollY > 50;
      if (scrolled !== lastScrolledRef.current) {
        lastScrolledRef.current = scrolled;
        setIsScrolled(scrolled);
        // Update CSS variable for header height so other components can adapt
        const newHeight = scrolled ? "3rem" : "3.5rem";
        document.documentElement.style.setProperty("--app-header-height", newHeight);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initialize once on mount
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header 
      className={`app-header sticky top-0 z-50 w-full px-4 transition-all duration-700 ease-in-out ${
        isScrolled ? "liquid-glass-header" : ""
      }`}
      style={{
        paddingTop: isScrolled ? "0.25rem" : "0.5rem",
        paddingBottom: isScrolled ? "0.25rem" : "0.5rem",
      }}
    >
      <div 
        className="container mx-auto flex items-center transition-all duration-700 ease-in-out"
        style={{
          height: isScrolled ? "3rem" : "3.5rem",
        }}
      >
        {/* Left side: Logo and Navigation */}
        <div className="flex items-center space-x-2">
          <Link href="/" prefetch={false} className="flex items-center space-x-2 hover:opacity-70 transition-opacity">
            <Image
              src="/Logo.png"
              alt="Calvinist Parrot"
              className="transition-all duration-700 ease-in-out"
              style={{
                width: isScrolled ? "2rem" : "3rem",
                height: isScrolled ? "2rem" : "3rem",
              }}
              width={50}
              height={50}
            />
            <span 
              className="app-logo overflow-hidden transition-opacity duration-700 ease-in-out"
              style={{
                // Keep width stable and only fade to avoid layout glitches
                maxWidth: "200px",
                opacity: isScrolled ? 0 : 1,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties}
            >
              Calvinist Parrot
            </span>
          </Link>

          {/* Fade-out separator when scrolled */}
          <span
            className="transition-opacity duration-700 ease-in-out"
            style={{ opacity: isScrolled ? 0 : 1, pointerEvents: isScrolled ? "none" : "auto" }}
            aria-hidden={isScrolled}
          >
            <Separator orientation="vertical" className="header-separator mr-2 h-4" />
          </span>

          {/* Desktop Navigation (visible on md and above) - fade out when scrolled */}
          <div
            className="hidden md:flex items-center transition-opacity duration-700 ease-in-out"
            style={{ opacity: isScrolled ? 0 : 1, pointerEvents: isScrolled ? "none" : "auto" }}
            aria-hidden={isScrolled}
          >
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/devotional" prefetch={false} className="hover:opacity-70 transition-opacity">Devotional</Link>
              <Link href="/prayer-tracker" prefetch={false} className="hover:opacity-70 transition-opacity">Prayer Tracker</Link>
              <Link href="/church-finder" prefetch={false} className="hover:opacity-70 transition-opacity">Church Finder</Link>
              <Link href="/about" prefetch={false} className="hover:opacity-70 transition-opacity">About</Link>
            </nav>
          </div>

          {/* Mobile Dropdown (hidden on md and above) - fade out when scrolled */}
          <div
            className="md:hidden transition-opacity duration-700 ease-in-out"
            style={{ opacity: isScrolled ? 0 : 1, pointerEvents: isScrolled ? "none" : "auto" }}
            aria-hidden={isScrolled}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:bg-muted/50">More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[8rem]">
                <DropdownMenuItem asChild>
                  <Link href="/devotional" prefetch={false} className="w-full">
                    Devotional
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/prayer-tracker" prefetch={false} className="w-full">
                    Prayer Tracker
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/church-finder" prefetch={false} className="w-full">
                    Church Finder
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/about" prefetch={false} className="w-full">
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
          {/* Hide ThemeToggle when scrolled for a cleaner compact header */}
          {!isScrolled && <ThemeToggle />}
          {loading ? null : user ? (
            // If logged in, show the user's name linking to profile
            <Link href="/profile" prefetch={false}>
              <Button 
                variant="secondary" 
                className="hover:bg-muted/50"
                size={isScrolled ? "sm" : "default"}
              >
                {user.name}
              </Button>
            </Link>
          ) : (
            <>
              {/* If not logged in, show Login and Register */}
              <Link href="/login" prefetch={false}>
                <Button 
                  variant="secondary" 
                  className="hover:bg-muted/50"
                  size={isScrolled ? "sm" : "default"}
                >
                  Login
                </Button>
              </Link>
              <Link href="/register" prefetch={false}>
                <Button 
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  size={isScrolled ? "sm" : "default"}
                >
                  Register
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
