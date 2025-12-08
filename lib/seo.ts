import type { Metadata } from "next";

// Centralized site-wide SEO / social metadata for the Calvinist Parrot application.
export const siteMetadata: Metadata = {
  metadataBase: new URL("https://www.calvinistparrot.com/"),
  applicationName: "Calvinist Parrot",
  title: {
    default: "Calvinist Parrot - Your AI Theological Assistant",
    template: "%s | Calvinist Parrot",
  },
  description:
    "An AI-powered theological assistant for chat, prayer tracking, and finding biblically sound churches. Engage with Reformed wisdom, organize your prayer life, and discover a faithful congregation near you.",
  openGraph: {
    title: "Calvinist Parrot - AI Chat, Prayer Tracker & Church Finder",
    description:
      "Chat with a Reformed AI, manage prayer requests, and discover faithful churches. Calvinist Parrot provides free digital tools to help you grow in your faith and connect with a local church.",
    url: "https://www.calvinistparrot.com/",
    siteName: "Calvinist Parrot",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/calvinist-parrot.png",
        width: 1200,
        height: 400,
        alt: "Calvinist Parrot - AI Theological Assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Calvinist Parrot - AI Chat, Prayer Tracker & Church Finder",
    description:
      "Chat with a Reformed AI, manage prayer requests, and discover faithful churches. Calvinist Parrot provides free digital tools to help you grow in your faith and connect with a local church.",
    images: ["/calvinist-parrot.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: [{ url: "/ios_dark_icon.png", sizes: "1024x1024", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico" }],
  },
  keywords: [
    "Calvinist Parrot",
    "Reformed AI Chatbot",
    "Theological Assistant",
    "Reformed Theology",
    "Prayer Tracker",
    "Church Finder",
    "Christian AI",
    "Bible Study",
    "Doctrinal Evaluation",
    "Apologetics",
    "Christian Chat",
    "Find a Reformed Church",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Calvinist Parrot",
  },
  robots: { index: true, follow: true },
};

export default siteMetadata;
