import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlphaClaw",
  description: "The source of DeFi intelligence for agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
