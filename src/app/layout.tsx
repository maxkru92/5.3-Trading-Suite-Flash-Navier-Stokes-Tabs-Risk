import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KRUPP CAPITAL // TRADING SUITE MK-III [LONDON EDGE + 13-DESK MATRIX]",
  description:
    "Dual-colourline institutional terminal: London Strategic Edge L3 risk desk landing terminal + 13-desk trading matrix — Hawkes toxicity, ABE fluid kernel, CBOE term structure, L3 MBO streaming, IV surfaces, stat-arb radar. Switchable MK-II navy / HFT phosphor colourlines.",
  keywords: ["KRUPP Capital", "L3 order book", "Hawkes process", "HFT risk engine", "CBOE VIX term structure", "London Strategic Edge", "Navier Stokes", "trading desk"],
  authors: [{ name: "KRUPP CAPITAL // RISK DESK" }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#05070b",
  width: "device-width",
  initialScale: 1,
};

/**
 * Pre-paint colourline bootstrap: reads the persisted palette from
 * localStorage and sets <html data-theme> BEFORE first paint so there is no
 * flash of the wrong colourline. Default = MK-II NAVY (13-desk reference).
 */
const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('krupp-colourline');document.documentElement.dataset.theme=(t==='hft'||t==='mk2')?t:'mk2';}catch(e){document.documentElement.dataset.theme='mk2';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="mk2" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
