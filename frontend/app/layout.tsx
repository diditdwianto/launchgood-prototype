import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

import QueueRail from "@/components/QueueRail";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Campaign Trust Copilot",
  description:
    "Reviewer console for AI-assisted crowdfunding campaign risk assessment.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <header className="border-line bg-panel flex items-center justify-between border-b px-7 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
            <Link href="/" className="text-base font-semibold tracking-tight">
              Campaign Trust Copilot
            </Link>
            <span className="mono text-muted text-[11px] tracking-[0.08em] uppercase">
              reviewer console
            </span>
          </div>
          <nav className="text-muted flex items-center gap-5 text-[13px]">
            <Link href="/decisions" className="hover:text-ink transition-colors">
              Decision log
            </Link>
            <span className="flex items-center gap-2">
              Trust &amp; safety review
              <span className="bg-brand-tint text-brand-deep flex h-6.5 w-6.5 items-center justify-center rounded-full text-[11px] font-semibold">
                DD
              </span>
            </span>
          </nav>
        </header>

        <div className="grid grid-cols-[320px_1fr]">
          <QueueRail />
          <main className="h-[calc(100vh-57px)] overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
