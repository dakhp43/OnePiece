import type { Metadata } from "next";
import { Open_Sans, Outfit, Roboto, Roboto_Mono } from "next/font/google";
import { CursorTrail } from "@/components/CursorTrail";
import { InlineScript } from "@/components/InlineScript";
import { ThemeSync } from "@/components/theme";
import { THEME_SCRIPT } from "@/components/theme-script";
import "./globals.css";

// Headings: Outfit (geometric sans). Subheadings: Open Sans. Body and UI: Roboto; numbers: Roboto Mono.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Carryover",
  description: "The note is where other scribes stop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${openSans.variable} ${roboto.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sets data-theme and data-trail before first paint (no flash of the wrong theme). */}
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <CursorTrail />
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="glass flex h-[var(--footer-h)] shrink-0 items-center justify-center gap-2 rounded-none border-x-0 border-b-0 px-6 text-center text-xs text-ink-3 shadow-none">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
          Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.
        </footer>
      </body>
    </html>
  );
}
