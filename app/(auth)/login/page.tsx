import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/app/") ? next : "/app/patients";
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Carry<span className="text-accent">over</span>
          </h1>
          <p className="mt-2 text-slate-600">The note is where other scribes stop.</p>
        </div>
        <LoginForm next={nextPath} />
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-600">Demo accounts (synthetic)</p>
          <p className="mt-1 font-mono">dr.patel@carryover.demo / demo1234</p>
          <p className="font-mono">dr.nguyen@carryover.demo / demo1234</p>
        </div>
      </div>
    </main>
  );
}
