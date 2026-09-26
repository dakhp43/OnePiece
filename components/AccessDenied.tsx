import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { ApiError } from "@/lib/api";

export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rise relative flex h-20 w-20 items-center justify-center rounded-3xl border border-danger/25 bg-danger-soft text-danger">
        <LockKeyhole className="relative h-9 w-9" />
      </div>
      <p className="rise mt-6 font-mono text-5xl font-semibold text-ink-4">403</p>
      <h1 className="rise mt-3 font-display text-2xl font-semibold text-ink">This patient is not assigned to you</h1>
      <p className="rise mt-2 max-w-sm text-sm text-ink-3">Doctors can only open their assigned patients and visits.</p>
      <Link href="/app/patients" className="glass-pill group mt-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-accent-ink transition-colors">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to my patients
      </Link>
    </div>
  );
}

/** Runs a loader for a server page, mapping ApiError 404 → notFound() and 403 → forbidden(). */
export async function guard<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    if (err instanceof ApiError && err.status === 403) forbidden();
    throw err;
  }
}
