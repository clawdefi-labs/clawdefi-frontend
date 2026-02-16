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
      <body className={`${spaceGrotesk.className} ${ibmPlexMono.variable}`}>
        {children}
        <VisitBeacon />
        <Analytics />
      </body>
    </html>
  );
}
