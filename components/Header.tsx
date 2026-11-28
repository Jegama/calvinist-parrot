// app/components/Header.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useHeaderConfig } from "@/components/providers/header-config-provider";
import { cn } from "@/lib/utils";

export function Header() {
  const { user, displayName, loading } = useAuth();
  const { config } = useHeaderConfig();
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrolledRef = useRef<boolean>(false);
  const headerRef = useRef<HTMLElement>(null);
  const compactChat = isScrolled && config.scrollContainer !== null;
  const hideNavigation = isScrolled && !compactChat;

  useEffect(() => {
    const scrollTarget = config.scrollContainer ?? window;
    const handleScroll = () => {
      const scrollTop = config.scrollContainer?.scrollTop ?? window.scrollY;
      // A smaller expansion threshold avoids flicker as shrinking the header
      // enlarges the transcript and clamps its scroll position near the bottom.
      const threshold = lastScrolledRef.current ? 8 : 50;
      const scrolled = !config.disableShrinking && scrollTop > threshold;
      if (scrolled !== lastScrolledRef.current) {
        lastScrolledRef.current = scrolled;
        setIsScrolled(scrolled);
      }
    };

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [config.disableShrinking, config.scrollContainer]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    // Keep the fixed-height chat shell aligned throughout the header animation.
    let previousHeight: number | undefined;
    const updateHeight = (height: number) => {
      if (height === previousHeight) return;
      previousHeight = height;
      document.body.style.setProperty("--app-header-height", `${height}px`);
    };
    const observer = new ResizeObserver(([entry]) => {
      // Use the observer's layout result, avoiding a second synchronous read.
      updateHeight(entry.borderBoxSize?.[0]?.blockSize ?? header.getBoundingClientRect().height);
    });
    observer.observe(header, { box: "border-box" });
    updateHeight(header.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      className={`app-header sticky top-0 z-50 w-full px-2 transition-all duration-700 ease-in-out motion-reduce:transition-none sm:px-4 ${
        isScrolled ? "liquid-glass-header" : ""
      }`}
      style={{
        paddingTop: isScrolled ? "0.25rem" : "0.5rem",
        paddingBottom: isScrolled ? "0.25rem" : "0.5rem",
      }}
    >
      <div
        className="container mx-auto flex items-center transition-all duration-700 ease-in-out motion-reduce:transition-none"
        style={{
          height: compactChat ? "2.5rem" : isScrolled ? "1.7rem" : "3.5rem",
        }}
      >
        {/* Left side: Logo and Navigation */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link href="/" prefetch={false} className={cn("flex min-w-0 items-center gap-1 hover:opacity-70 transition-opacity sm:gap-2", compactChat && "min-h-11 min-w-11 justify-center")}>
            <Image
              src="/Logo.png"
              alt="Calvinist Parrot"
              className="transition-all duration-700 ease-in-out"
              style={{
                width: isScrolled ? "1.5rem" : "3rem",
                height: isScrolled ? "1.5rem" : "3rem",
              }}
              width={50}
              height={50}
            />
            <span
              className="app-logo hidden min-w-0 max-w-[200px] overflow-hidden transition-opacity duration-700 ease-in-out sm:block"
              style={
                {
                  // Keep width stable and only fade to avoid layout glitches
                  opacity: isScrolled ? 0 : 1,
                } as React.CSSProperties
              }
            >
              Calvinist Parrot
            </span>
          </Link>

          {/* Fade-out separator when scrolled */}
          <span
            className="hidden transition-opacity duration-700 ease-in-out min-[360px]:inline-block"
            style={{ opacity: hideNavigation ? 0 : 1, pointerEvents: hideNavigation ? "none" : "auto" }}
            aria-hidden={hideNavigation}
          >
            <Separator orientation="vertical" className="header-separator mr-2 h-4" />
          </span>

          {/* Desktop Navigation (visible on lg and above) - fade out when scrolled */}
          <div
            className="hidden lg:flex items-center transition-opacity duration-700 ease-in-out"
            style={{ opacity: hideNavigation ? 0 : 1, pointerEvents: hideNavigation ? "none" : "auto" }}
            aria-hidden={hideNavigation}
            inert={hideNavigation}
          >
            <nav className="flex items-center space-x-4 xl:space-x-6 text-sm font-medium">
              <Link href="/" prefetch={false} className="hover:opacity-70 transition-opacity">
                Chat
              </Link>
              <Link href="/devotional" prefetch={false} className="hover:opacity-70 transition-opacity">
                Devotional
              </Link>
              <Link href="/journal" prefetch={false} className="hover:opacity-70 transition-opacity">
                Journal
              </Link>
              <Link href="/prayer-tracker" prefetch={false} className="hover:opacity-70 transition-opacity">
                Prayer Tracker
              </Link>
              <Link href="/kids-discipleship" prefetch={false} className="hover:opacity-70 transition-opacity">
                Heritage
              </Link>
              <Link href="/church-finder" prefetch={false} className="hover:opacity-70 transition-opacity">
                Church Finder
              </Link>
              <Link href="/about" prefetch={false} className="hover:opacity-70 transition-opacity">
                About
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hover:opacity-70 transition-opacity">Labs</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border shadow-lg min-w-[12rem]">
                  <DropdownMenuItem asChild>
                    <Link href="/connect" prefetch={false} className="w-full">
                      Connect to Parrot
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/llm-evaluation-dashboard" prefetch={false} className="w-full">
                      AI Evaluation Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/sermon-evaluation" prefetch={false} className="w-full">
                      Sermon Evaluation
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          {/* Mobile Dropdown (hidden on lg and above) - fade out when scrolled */}
          <div
            className="lg:hidden transition-opacity duration-700 ease-in-out"
            style={{ opacity: hideNavigation ? 0 : 1, pointerEvents: hideNavigation ? "none" : "auto" }}
            aria-hidden={hideNavigation}
            inert={hideNavigation}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn("hover:bg-muted/50", compactChat && "h-11")}>
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border shadow-lg min-w-[8rem]">
                <DropdownMenuItem asChild>
                  <Link href="/" prefetch={false} className="w-full">
                    Chat
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/devotional" prefetch={false} className="w-full">
                    Devotional
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/journal" prefetch={false} className="w-full">
                    Journal
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/prayer-tracker" prefetch={false} className="w-full">
                    Prayer Tracker
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/kids-discipleship" prefetch={false} className="w-full">
                    Heritage
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/church-finder" prefetch={false} className="w-full">
                    Church Finder
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/about" prefetch={false} className="w-full">
                    About
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/connect" prefetch={false} className="w-full">
                    Connect to Parrot
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/llm-evaluation-dashboard" prefetch={false} className="w-full">
                    AI Eval (Labs)
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sermon-evaluation" prefetch={false} className="w-full">
                    Sermon Evaluation (Labs)
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Spacer to push the right side to the opposite end */}
        <div className="flex-1" />

        {/* Right side: Theme toggle and user session actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Hide ThemeToggle when scrolled for a cleaner compact header */}
          {!isScrolled && <ThemeToggle />}
          {loading ? null : user ? (
            // If logged in, show the user's name linking to profile
            <Link href="/profile" prefetch={false}>
              <Button variant="outline" className={cn("hover:bg-muted/50 max-sm:px-2 max-sm:text-xs", compactChat ? "h-11" : "max-sm:h-8")} size={isScrolled ? "xsm" : "default"}>
                {displayName}
              </Button>
            </Link>
          ) : (
            <>
              {/* If not logged in, show Login and Register */}
              <Link href="/login" prefetch={false}>
                <Button variant="outline" className={cn("hover:bg-muted/50 max-sm:px-2 max-sm:text-xs", compactChat ? "h-11" : "max-sm:h-8")} size={isScrolled ? "sm" : "default"}>
                  Login
                </Button>
              </Link>
              <Link href="/register" prefetch={false}>
                <Button
                  className={cn("bg-accent text-accent-foreground hover:bg-accent/90 max-sm:px-2 max-sm:text-xs", compactChat ? "h-11" : "max-sm:h-8")}
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
