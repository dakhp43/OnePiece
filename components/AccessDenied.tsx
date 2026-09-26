import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ApiError } from "@/lib/api";

export function AccessDenied() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <p className="text-5xl font-bold text-slate-300">403</p>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">This patient is not assigned to you</h1>
      <p className="mt-2 text-sm text-slate-600">Doctors can only open their assigned patients and visits.</p>
      <Link href="/app/patients" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
        Back to my patients
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
