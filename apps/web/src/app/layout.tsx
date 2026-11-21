import type { Metadata } from "next";
import localFont from "next/font/local";
import { CobaltFilterDefs } from "@/components/engraving";
import "./globals.css";

// Vendored woff2 files (src/fonts, downloaded once via scripts/vendor-fonts.mjs).
// The build never touches Google Fonts — a flaky upstream must not be able to
// take the site down.
const inter = localFont({
  src: [
    { path: "../fonts/inter-400n.woff2", weight: "400", style: "normal" },
    { path: "../fonts/inter-500n.woff2", weight: "500", style: "normal" },
    { path: "../fonts/inter-600n.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-300n.woff2", weight: "300", style: "normal" },
    { path: "../fonts/cormorant-400n.woff2", weight: "400", style: "normal" },
    { path: "../fonts/cormorant-500n.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-600n.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-300i.woff2", weight: "300", style: "italic" },
    { path: "../fonts/cormorant-400i.woff2", weight: "400", style: "italic" },
    { path: "../fonts/cormorant-500i.woff2", weight: "500", style: "italic" },
    { path: "../fonts/cormorant-600i.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const ebGaramond = localFont({
  src: [
    { path: "../fonts/garamond-400n.woff2", weight: "400", style: "normal" },
    { path: "../fonts/garamond-500n.woff2", weight: "500", style: "normal" },
    { path: "../fonts/garamond-400i.woff2", weight: "400", style: "italic" },
    { path: "../fonts/garamond-500i.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-eb-garamond",
  display: "swap",
});

const jetbrains = localFont({
  src: [
    { path: "../fonts/jetbrains-400n.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jetbrains-500n.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://coral.grotto.dev"),
  title: {
    default: "CORAL — Growing intelligence, one decision at a time",
    template: "%s · CORAL",
  },
  description:
    "CORAL is a self-evolving trading agent. Every decision calcifies into a polyp of memory, and the reef it grows is the strategy. Connects to the Robinhood Trading MCP and Robinhood Chain. Paper by default.",
  keywords: [
    "CORAL",
    "self-evolving agent",
    "agentic trading",
    "Robinhood MCP",
    "Robinhood Chain",
    "AI trading agent",
    "MCP server",
    "LangGraph",
  ],
  authors: [{ name: "CORAL" }],
  openGraph: {
    title: "CORAL — Growing intelligence, one decision at a time",
    description:
      "A self-evolving AI agent that grows a reef of memory from every decision. Robinhood Trading MCP and Robinhood Chain. Paper trading by default.",
    type: "website",
    siteName: "CORAL",
  },
  twitter: {
    card: "summary_large_image",
    title: "CORAL",
    description: "Growing intelligence, one decision at a time.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cormorant.variable} ${ebGaramond.variable} ${jetbrains.variable}`}
    >
      <body className="bg-white text-ink antialiased">
        <CobaltFilterDefs />
        {children}
      </body>
    </html>
  );
}
