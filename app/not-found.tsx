import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EcgTrace } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="rise text-sm font-medium text-ink-3">No signal</p>
      <div className="relative mt-3 w-full max-w-md">
        <p className="rise font-display text-[6.5rem] font-bold leading-none tracking-tight text-ink-4/50">404</p>
        <EcgTrace mode="draw" beats={1} strokeWidth={2.5} className="absolute inset-x-0 top-1/2 h-16 w-full -translate-y-1/2 text-accent" />
      </div>
      <h1 className="rise mt-2 text-xl font-semibold text-ink">Not found</h1>
      <Link href="/app/patients" className="glass-pill group mt-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-accent-ink transition-colors">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to my patients
      </Link>
    </div>
  );
}
