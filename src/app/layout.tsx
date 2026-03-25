import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import VisitBeacon from "@/components/VisitBeacon";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ClawDeFi | The DeFi Intelligence Layer for Agents",
  description:
    "Execution infrastructure for agent-native finance. ClawDeFi lets AI agents query protocols, assess risk, and execute on-chain actions — with simulation, verification, and safety gates before capital moves.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.className} ${ibmPlexMono.variable}`}>
        <div className="alpha-banner" role="status" aria-live="polite">
          <span className="alpha-banner-label">ALPHA:</span> ClawDeFi is in active development.
          Autonomous agents are powerful but early-stage — use with caution and verify all actions
          before signing.
        </div>
        {children}
        <VisitBeacon />
        <Analytics />
      </body>
    </html>
  );
}
