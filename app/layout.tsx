// app/layout.tsx

import type { CSSProperties } from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Source_Serif_4, Lora, Spectral } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/Header"
import { AppProviders } from "@/components/providers/app-providers"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"
import { siteMetadata } from "@/lib/seo"

// Load variable fonts and expose as CSS variables for system-wide use
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" })
const lora = Lora({ subsets: ["latin"], weight: ["600"], variable: "--font-serif-lora" })
const spectral = Spectral({ subsets: ["latin"], weight: ["600"], variable: "--font-serif-spectral" })

// Use brand primary for light chrome and a dark neutral that matches the dark background token
const themeColor: Viewport["themeColor"] = [
  { media: "(prefers-color-scheme: light)", color: "#004D70" }, // Deep Blue (primary)
  { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" }, // hsl(0 0% 10%) from dark --background
]

export const metadata: Metadata = siteMetadata;

export const viewport: Viewport = {
  themeColor,
};

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
      {/* Apply font variables to the document; actual usage controlled via globals.css */}
      <body className={`${inter.variable} ${sourceSerif.variable} ${lora.variable} ${spectral.variable}`} suppressHydrationWarning style={bodyStyle}>
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

