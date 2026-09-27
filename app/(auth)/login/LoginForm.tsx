"use client";

import { useState } from "react";
import { ArrowRight, CircleAlert, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("dr.patel@carryover.demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = next;
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Sign-in failed");
    setBusy(false);
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-9" />
          </div>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus className="pl-9" />
          </div>
        </div>
        {error && (
          <p role="alert" className="fade-in flex items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            <CircleAlert className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <Button type="submit" size="lg" className="group w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Sign in"}
          {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </Button>
      </form>
    </Card>
  );
}
