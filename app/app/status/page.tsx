import Link from "next/link";
import { CircleCheck, CircleMinus, CircleX, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireDoctorPage } from "@/lib/auth/current";
import { checkHealth } from "@/lib/health";
import { cn } from "@/lib/utils";

type State = "ok" | "off" | "fail";

function Row({ label, state, detail }: { label: string; state: State; detail: React.ReactNode }) {
  const Icon = state === "ok" ? CircleCheck : state === "off" ? CircleMinus : CircleX;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", state === "ok" ? "text-emerald-600" : state === "off" ? "text-slate-400" : "text-red-600")} />
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{label} <span className="text-xs font-normal text-slate-500">({state === "ok" ? "ready" : state === "off" ? "not set up" : "problem"})</span></p>
        <p className="text-sm text-slate-600">{detail}</p>
      </div>
    </li>
  );
}

export default async function StatusPage({ searchParams }: PageProps<"/app/status">) {
  await requireDoctorPage();
  const { fresh } = await searchParams;
  const h = await checkHealth({ fresh: fresh === "1" });
  const u = h.usage;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">System status</h1>
          <p className="text-sm text-slate-500">Checked {new Date(h.checkedAt).toLocaleTimeString("en-US")} · no billable calls</p>
        </div>
        <Link href="/app/status?fresh=1" className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Re-check
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Services</CardTitle></CardHeader>
        <ul className="divide-y divide-slate-100">
          <Row
            label={`Database (${h.db.driver === "tiger" ? "Tiger Cloud" : "local PGlite"})`}
            state={h.db.ok ? "ok" : "fail"}
            detail={h.db.ok
              ? <>Latency {h.db.latencyMs} ms · hypertables: {h.db.hypertables.length ? h.db.hypertables.join(", ") : "none (TimescaleDB not available)"}</>
              : h.db.error}
          />
          <Row
            label="ElevenLabs transcription"
            state={!h.elevenlabs.configured ? "off" : h.elevenlabs.ok ? "ok" : "fail"}
            detail={h.elevenlabs.ok
              ? <>{h.elevenlabs.model} · {h.elevenlabs.tier} plan · {h.elevenlabs.creditsUsed?.toLocaleString()} of {h.elevenlabs.creditLimit?.toLocaleString()} credits used this month</>
              : h.elevenlabs.error ?? "Set ELEVENLABS_API_KEY"}
          />
          <Row
            label="Gemini"
            state={!h.gemini.configured ? "off" : h.gemini.ok ? "ok" : "fail"}
            detail={h.gemini.configured
              ? <>{h.gemini.model}{h.gemini.fallbackModel && <> · fallback {h.gemini.fallbackModel} {h.gemini.fallbackOk === false ? "(unavailable)" : ""}</>}{h.gemini.error && <> · {h.gemini.error}</>}</>
              : "Set GEMINI_API_KEY"}
          />
          <Row
            label="Backboard memory"
            state={!h.backboard.configured ? "off" : !h.backboard.ok ? "fail" : h.backboard.autoReload ? "fail" : "ok"}
            detail={h.backboard.configured
              ? h.backboard.ok
                ? <>Balance ${h.backboard.balanceUsd?.toFixed(2) ?? "?"} · auto-reload {h.backboard.autoReload === undefined ? "unknown" : h.backboard.autoReload ? "ON — turn it off to avoid charges" : "off"} · {h.backboard.enabled ? "enabled" : "disabled (BACKBOARD_ENABLED=false)"}</>
                : h.backboard.error
              : "Set BACKBOARD_API_KEY (brief uses Gemini/chart meanwhile)"}
          />
          <Row
            label={`Email (${h.email.provider})`}
            state={h.email.configured ? "ok" : "off"}
            detail={h.email.configured ? "Configured (not test-sent)" : "Set GMAIL_USER and GMAIL_APP_PASSWORD"}
          />
          <Row
            label="Offline demo fallback"
            state={h.demoFallback ? "ok" : "off"}
            detail={h.demoFallback ? "On: failed or slow AI calls use the saved demo run" : "Off (DEMO_FALLBACK=false)"}
          />
        </ul>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Today&apos;s usage (free-tier caps)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xl font-semibold tabular-nums">{u.today.geminiCalls} / {u.limits.geminiCalls}</p>
            <p className="text-xs text-slate-500">Gemini calls</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{(u.today.sttSeconds / 60).toFixed(1)} / {u.limits.sttMinutes} min</p>
            <p className="text-xs text-slate-500">audio transcribed ({u.today.sttCalls} recordings)</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{u.today.backboardCalls} / {u.limits.backboardCalls}</p>
            <p className="text-xs text-slate-500">Backboard calls</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{u.limits.maxRecordingMinutes} min</p>
            <p className="text-xs text-slate-500">max per recording</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
