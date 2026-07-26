"use client";

import Link from "next/link";
import { BookOpen, Church, Sprout } from "lucide-react";

const shortcutClassName =
  "badge--neutral inline-flex min-h-10 items-center gap-1.5 whitespace-normal px-3 py-2 text-start text-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ChatShortcuts() {
  return (
    <nav
      aria-label="Calvinist Parrot features"
      className="flex flex-wrap justify-center gap-2 lg:hidden landscape:hidden"
    >
      <Link href="/devotional" prefetch={false} className={shortcutClassName}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "1rem", lineHeight: 1 }}
          aria-hidden="true"
        >
          candle
        </span>
        <span>Devotional</span>
      </Link>
      <Link href="/journal" prefetch={false} className={shortcutClassName}>
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        <span>Journal</span>
      </Link>
      <Link href="/prayer-tracker" prefetch={false} className={shortcutClassName}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "1rem", lineHeight: 1 }}
          aria-hidden="true"
        >
          folded_hands
        </span>
        <span>Prayer Tracker</span>
      </Link>
      <Link href="/kids-discipleship" prefetch={false} className={shortcutClassName}>
        <Sprout className="h-4 w-4" aria-hidden="true" />
        <span>Heritage</span>
      </Link>
      <Link href="/church-finder" prefetch={false} className={shortcutClassName}>
        <Church className="h-4 w-4" aria-hidden="true" />
        <span>Church Finder</span>
      </Link>
    </nav>
  );
}
