import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Literata, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const serif = Literata({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Learning chat",
  description: "A private assistant that remembers what matters.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
