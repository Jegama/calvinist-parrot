"use client";

import { ReactQueryProvider } from "./react-query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { HeaderConfigProvider } from "./header-config-provider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ReactQueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HeaderConfigProvider>
            {children}
          </HeaderConfigProvider>
        </ThemeProvider>
      </ReactQueryProvider>
    </AuthProvider>
  );
}
