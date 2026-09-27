"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app/patients", label: "Patients", icon: Users, match: (p: string) => p.startsWith("/app/patients") || p.startsWith("/app/visits") },
  { href: "/app/status", label: "Status", icon: Activity, match: (p: string) => p.startsWith("/app/status"), title: "System status" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      {LINKS.map(({ href, label, icon: Icon, match, title }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            title={title ?? label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-accent-soft text-accent-ink" : "text-ink-3 hover:bg-surface-3 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
