import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_ORIGIN } from "@/lib/site-links";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "VRTY Claim | Verity Protocol",
  description:
    "Claim 58.9 VRTY if your XRPL wallet has held ≥ 10 XRP for 7 days. First 10,000 claims.",
  openGraph: {
    title: "VRTY Claim",
    description: "Standalone claim portal for eligible XRPL wallets.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
