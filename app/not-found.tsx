import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Not found</h1>
      <Link href="/app/patients" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
        Back to my patients
      </Link>
    </div>
  );
}
