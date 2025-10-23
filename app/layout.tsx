// app/layout.tsx

import type { CSSProperties } from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/Header"
import { AppProviders } from "@/components/providers/app-providers"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Calvinist Parrot",
  description: "An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const bodyStyle = {
    "--app-header-height": "3.5rem",
  } as CSSProperties

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning style={bodyStyle}>
        <AppProviders>
          <Header />
          {children}
        </AppProviders>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}

