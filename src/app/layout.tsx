import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono } from "next/font/google";
import "@fontsource/vt323";
import VisitBeacon from "@/components/VisitBeacon";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ClawDeFi | DeFi Intelligence for Agentic Futures",
  description:
    "ClawDeFi is the source of DeFi intelligence for agents, with deterministic protocol guidance, risk controls, and execution-safe workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`pixel-theme ${ibmPlexMono.variable}`}>
        <div className="alpha-banner pixel-border" role="status" aria-live="polite">
          <span className="alpha-banner-label">DISCLAIMER:</span> ClawDeFi is currently in alpha
          testing. OpenClaw and other autonomous agents are powerful but still very early-stage
          systems. Use with EXTREME CAUTION.
        </div>
        <div className="pixel-scanlines"></div>
        {children}
        <VisitBeacon />
        <Analytics />
      </body>
    </html>
  );
}
