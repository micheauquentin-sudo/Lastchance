import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { CookieConsent } from "@/components/cookie-consent";
import { APP_URL } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Simple comme QR — Gamification pour commerces",
    template: "%s · Simple comme QR",
  },
  description:
    "Plateforme de gamification pour commerces : 14 modules, 15 mécaniques de jeu, animations et fidélité par QR code pour restaurants, bars et boutiques.",
  openGraph: {
    siteName: "Simple comme QR",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <Analytics />
        <CookieConsent />
        {children}
      </body>
    </html>
  );
}
