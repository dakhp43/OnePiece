export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8" aria-label="Loading">
      <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-100" />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-white shadow-sm ring-1 ring-slate-200" />)}
        </div>
        <div className="space-y-4 lg:col-span-2">
          {[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-lg bg-white shadow-sm ring-1 ring-slate-200" />)}
        </div>
      </div>
    </div>
  );
}
