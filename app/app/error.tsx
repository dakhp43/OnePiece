"use client";

import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rise flex h-16 w-16 items-center justify-center rounded-2xl border border-warn/30 bg-warn-soft text-warn">
        <TriangleAlert className="h-8 w-8" />
      </div>
      <h1 className="rise mt-5 font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="rise mt-2 max-w-md text-sm text-ink-3">{error.message || "Unexpected error."}</p>
      <div className="rise mt-6 flex justify-center gap-3">
        <Button onClick={reset}><RotateCw className="h-4 w-4" /> Try again</Button>
        <Link href="/app/patients"><Button variant="secondary">My patients</Button></Link>
      </div>
    </div>
  );
}
