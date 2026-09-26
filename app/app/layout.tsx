import Link from "next/link";
import { Activity, LogOut } from "lucide-react";
import { requireDoctorPage } from "@/lib/auth/current";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const session = await requireDoctorPage();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/app/patients" className="text-lg font-bold tracking-tight text-slate-900">
          Carry<span className="text-accent">over</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/app/status" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100" title="System status">
            <Activity className="h-4 w-4" /> Status
          </Link>
          <span>{session.name}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100" title="Sign out">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
