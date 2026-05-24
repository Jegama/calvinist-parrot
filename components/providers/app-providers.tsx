"use client";

import { ReactQueryProvider } from "./react-query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { HeaderConfigProvider } from "./header-config-provider";
import { DialogPointerEventsGuard } from "./dialog-pointer-events-guard";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HeaderConfigProvider>
            <DialogPointerEventsGuard />
            {children}
          </HeaderConfigProvider>
        </ThemeProvider>
      </AuthProvider>
    </ReactQueryProvider>
  );
}
