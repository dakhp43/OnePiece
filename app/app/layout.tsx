import Link from "next/link";
import { LogOut } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Logo } from "@/components/brand";
import { CommandPalette, CommandPaletteTrigger } from "@/components/CommandPalette";
import { LiquidGlass } from "@/components/LiquidGlass";
import { TrailToggle } from "@/components/CursorTrail";
import { ThemeToggle } from "@/components/theme";
import { requireDoctorPage } from "@/lib/auth/current";

const initials = (name: string) =>
  name.replace(/^Dr\.?\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const session = await requireDoctorPage();
  return (
    <div className="flex flex-1 flex-col">
      {/* Floating liquid-glass bar: page content scrolls underneath and bends at its edges. */}
      <header className="sticky top-0 z-40 h-[var(--header-h)] px-2 pt-2 sm:px-3">
        <LiquidGlass radius={18} blur={10} strength={24} band={20} className="flex h-full items-center justify-between gap-4 rounded-[18px] px-3 sm:px-4">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/app/patients" aria-label="Carryover home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Logo />
            </Link>
            <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
            <AppNav />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CommandPaletteTrigger />
            <TrailToggle />
            <ThemeToggle />
            <span className="glass-pill hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 md:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-strong text-[11px] font-semibold text-on-accent">
                {initials(session.name)}
              </span>
              <span className="font-medium text-ink-2">{session.name}</span>
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger-ink"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </LiquidGlass>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <CommandPalette />
    </div>
  );
}
