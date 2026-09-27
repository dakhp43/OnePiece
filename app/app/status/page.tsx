import Link from "next/link";
import { CircleCheck, CircleMinus, CircleX, RefreshCw } from "lucide-react";
import { EcgTrace } from "@/components/brand";
import { stagger } from "@/components/motion";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireDoctorPage } from "@/lib/auth/current";
import { checkHealth } from "@/lib/health";
import { cn } from "@/lib/utils";
import { HelpInsights } from "./HelpInsights";

type State = "ok" | "off" | "fail";

function Row({ label, state, detail, i = 0 }: { label: string; state: State; detail: React.ReactNode; i?: number }) {
  const Icon = state === "ok" ? CircleCheck : state === "off" ? CircleMinus : CircleX;
  return (
    <li className="rise grid grid-cols-[auto_minmax(0,1fr)_7rem] items-center gap-4 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_10rem]" style={stagger(i)}>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          state === "ok" ? "bg-ok-soft text-ok" : state === "off" ? "bg-surface-3 text-ink-4" : "bg-danger-soft text-danger",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {label}{" "}
          <span className={cn("text-xs font-normal", state === "ok" ? "text-ok-ink" : state === "off" ? "text-ink-3" : "text-danger-ink")}>
            ({state === "ok" ? "ready" : state === "off" ? "not set up" : "problem"})
          </span>
        </p>
        <p className="text-sm text-ink-3">{detail}</p>
      </div>
      <EcgTrace
        mode={state === "ok" ? "sweep" : state === "off" ? "flat" : "draw"}
        beats={2}
        strokeWidth={1.75}
        duration={2.6 + i * 0.35}
        className={cn(
          "h-9 w-full",
          state === "ok" ? "text-ok" : state === "off" ? "text-ink-4" : "text-danger",
        )}
      />
    </li>
  );
}

function Meter({ value, limit, label, display, i }: { value: number; limit: number; label: string; display: React.ReactNode; i: number }) {
  const share = limit > 0 ? Math.min(1, value / limit) : 0;
  return (
    <div className="rise glass rounded-2xl p-4" style={stagger(i)}>
      <p className="font-mono text-xl font-semibold tabular-nums text-ink">{display}</p>
      <p className="mt-0.5 text-xs text-ink-3">{label}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("meter-fill h-full rounded-full", share > 0.85 ? "bg-danger" : share > 0.6 ? "bg-warn" : "bg-accent")}
          style={{ width: `${Math.max(share * 100, value > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export default async function StatusPage({ searchParams }: PageProps<"/app/status">) {
  await requireDoctorPage();
  const { fresh } = await searchParams;
  const h = await checkHealth({ fresh: fresh === "1" });
  const u = h.usage;

  const dbState: State = h.db.ok ? "ok" : "fail";
  const elevenState: State = !h.elevenlabs.configured ? "off" : h.elevenlabs.ok ? "ok" : "fail";
  const geminiState: State = !h.gemini.configured ? "off" : h.gemini.ok ? "ok" : "fail";
  const backboardState: State = !h.backboard.configured ? "off" : !h.backboard.ok ? "fail" : h.backboard.autoReload ? "fail" : "ok";
  const snowflakeState: State = !h.snowflake.configured ? "off" : h.snowflake.ok ? "ok" : "fail";
  const emailState: State = h.email.configured ? "ok" : "off";
  const fallbackState: State = h.demoFallback ? "ok" : "off";
  const states = [dbState, elevenState, geminiState, backboardState, snowflakeState, emailState, fallbackState];
  const failing = states.filter((x) => x === "fail").length;
  const off = states.filter((x) => x === "off").length;

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-sub text-sm font-semibold text-accent-ink">Pre-demo check</p>
            <h1 className="mt-1 font-display text-4xl font-semibold leading-tight tracking-[-0.01em] text-ink">System status</h1>
            <p className="mt-2 text-sm text-ink-3">Checked {new Date(h.checkedAt).toLocaleTimeString("en-US")} · no billable calls</p>
          </div>
          <Link href="/app/status?fresh=1" className="glass-pill group flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:text-accent-ink">
            <RefreshCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" /> Re-check
          </Link>
        </div>

        <div
          className={cn(
            "rise mt-6 flex items-center gap-3 rounded-2xl border px-5 py-4",
            failing ? "border-danger/30 bg-danger-soft text-danger-ink" : off ? "border-warn/30 bg-warn-soft text-warn-ink" : "border-ok/30 bg-ok-soft text-ok-ink",
          )}
          style={stagger(1)}
        >
          <span className="relative flex h-3 w-3">
            <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", failing ? "bg-danger" : off ? "bg-warn" : "bg-ok")} />
            <span className={cn("relative h-3 w-3 rounded-full", failing ? "bg-danger" : off ? "bg-warn" : "bg-ok")} />
          </span>
          <p className="text-sm font-semibold">
            {failing ? `${failing} service${failing === 1 ? "" : "s"} need${failing === 1 ? "s" : ""} attention` : off ? `${off} service${off === 1 ? "" : "s"} not set up` : "All systems ready for the demo"}
          </p>
        </div>

        <Card className="rise mt-6 overflow-hidden" style={stagger(2)}>
          <CardHeader><CardTitle>Services</CardTitle><span className="font-mono text-[11px] text-ink-3">{states.filter((x) => x === "ok").length}/{states.length} ready</span></CardHeader>
          <ul className="divide-y divide-line">
            <Row
              i={3}
              label={`Database (${h.db.driver === "tiger" ? "Tiger Cloud" : "local PGlite"})`}
              state={dbState}
              detail={h.db.ok
                ? <>Latency {h.db.latencyMs} ms · hypertables: {h.db.hypertables.length ? h.db.hypertables.join(", ") : "none (TimescaleDB not available)"}</>
                : h.db.error}
            />
            <Row
              i={4}
              label="ElevenLabs transcription"
              state={elevenState}
              detail={h.elevenlabs.ok
                ? <>{h.elevenlabs.model} · {h.elevenlabs.tier} plan · {h.elevenlabs.creditsUsed?.toLocaleString()} of {h.elevenlabs.creditLimit?.toLocaleString()} credits used this month</>
                : h.elevenlabs.error ?? "Set ELEVENLABS_API_KEY"}
            />
            <Row
              i={5}
              label="Gemini"
              state={geminiState}
              detail={h.gemini.configured
                ? <>{h.gemini.model}{h.gemini.fallbackModel && <> · fallback {h.gemini.fallbackModel} {h.gemini.fallbackOk === false ? "(unavailable)" : ""}</>}{h.gemini.error && <> · {h.gemini.error}</>}</>
                : "Set GEMINI_API_KEY"}
            />
            <Row
              i={6}
              label="Backboard memory"
              state={backboardState}
              detail={h.backboard.configured
                ? h.backboard.ok
                  ? <>Balance ${h.backboard.balanceUsd?.toFixed(2) ?? "?"} · auto-reload {h.backboard.autoReload === undefined ? "unknown" : h.backboard.autoReload ? "ON — turn it off to avoid charges" : "off"} · {h.backboard.enabled ? "enabled" : "disabled (BACKBOARD_ENABLED=false)"}</>
                  : h.backboard.error
                : "Set BACKBOARD_API_KEY (brief uses Gemini/chart meanwhile)"}
            />
            <Row
              i={7}
              label="Snowflake help assistant"
              state={snowflakeState}
              detail={h.snowflake.configured
                ? h.snowflake.ok
                  ? <>Knowledge base, search and question log in Snowflake ({h.snowflake.retrieval === "cortex-search" ? "Cortex Search" : "SQL API"}) · answers by {h.snowflake.cortex === "available" ? <>Cortex {h.snowflake.model}</> : <span title={h.snowflake.cortexNote}>Gemini ({h.snowflake.cortex === "off" ? "Cortex off: SNOWFLAKE_CORTEX=off" : "Cortex isn't enabled on this account"})</span>}</>
                  : h.snowflake.error
                : "Set SNOWFLAKE_ACCOUNT_URL and SNOWFLAKE_PAT (help answers from the built-in articles meanwhile)"}
            />
            <Row
              i={8}
              label={`Email (${h.email.provider})`}
              state={emailState}
              detail={h.email.configured ? "Configured (not test-sent)" : "Set GMAIL_USER and GMAIL_APP_PASSWORD"}
            />
            <Row
              i={9}
              label="Offline demo fallback"
              state={fallbackState}
              detail={h.demoFallback ? "On: failed or slow AI calls use the saved demo run" : "Off (DEMO_FALLBACK=false)"}
            />
          </ul>
        </Card>

        {h.snowflake.configured && h.snowflake.ok && <HelpInsights />}

        <h2 className="mt-8 font-sub text-sm font-semibold text-ink-2">Today&apos;s usage (free-tier caps)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Meter i={9} value={u.today.geminiCalls} limit={u.limits.geminiCalls} display={<>{u.today.geminiCalls} / {u.limits.geminiCalls}</>} label="Gemini calls" />
          <Meter i={10} value={u.today.sttSeconds / 60} limit={u.limits.sttMinutes} display={<>{(u.today.sttSeconds / 60).toFixed(1)} / {u.limits.sttMinutes} min</>} label={`audio transcribed (${u.today.sttCalls} recordings)`} />
          <Meter i={11} value={u.today.backboardCalls} limit={u.limits.backboardCalls} display={<>{u.today.backboardCalls} / {u.limits.backboardCalls}</>} label="Backboard calls" />
          <Meter i={12} value={u.today.snowflakeCalls} limit={u.limits.snowflakeCalls} display={<>{u.today.snowflakeCalls} / {u.limits.snowflakeCalls}</>} label="Snowflake calls (help)" />
          <div className="rise glass rounded-2xl p-4" style={stagger(13)}>
            <p className="font-mono text-xl font-semibold tabular-nums text-ink">{u.limits.maxRecordingMinutes} min</p>
            <p className="mt-0.5 text-xs text-ink-3">max per recording</p>
          </div>
        </div>
      </div>
    </div>
  );
}
