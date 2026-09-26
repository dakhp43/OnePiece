import { AudioLines, ClipboardCheck, Send } from "lucide-react";
import { EcgTrace, Logo } from "@/components/brand";
import { TrailToggle } from "@/components/CursorTrail";
import { stagger } from "@/components/motion";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./LoginForm";

const PILLARS = [
  { icon: AudioLines, title: "Every sentence cites its source", body: "Click a line of the note to hear the audio it came from. Confidence is computed in code, with the reasons shown." },
  { icon: ClipboardCheck, title: "Omissions caught before sign-off", body: "A visit checklist and last visit's open items are audited against the transcript." },
  { icon: Send, title: "Follow-through, not just a note", body: "Office tasks, items carried to the next visit, and a plain-language summary in English or Spanish." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/app/") ? next : "/app/patients";
  return (
    <main className="grid flex-1 lg:grid-cols-[1.08fr_1fr]">
      {/* Story panel */}
      <section className="bg-monitor-grid relative m-3 hidden flex-col justify-between overflow-hidden rounded-[28px] border border-white/10 p-12 text-monitor-ink lg:flex">
        <Logo size="lg" onDark className="rise" />

        <div className="relative">
          <p className="rise mb-4 inline-flex items-center gap-2 rounded-full border border-monitor-line bg-monitor-2/80 px-3 py-1 font-sub text-xs font-semibold text-monitor-dim" style={stagger(1)}>
            <span className="halo h-1.5 w-1.5 rounded-full bg-monitor-trace text-monitor-trace" /> Ambient scribe · audited
          </p>
          <h1 className="rise max-w-xl font-display text-5xl font-semibold leading-[1.1] tracking-[-0.01em]" style={stagger(2)}>
            The note is where other scribes <em className="not-italic text-monitor-trace">stop.</em>
          </h1>
          <EcgTrace mode="sweep" beats={3} strokeWidth={2} className="mt-8 h-16 w-full text-monitor-trace" />

          {/* Illustration of what review looks like */}
          <div className="rise mt-8 max-w-md rounded-xl border border-monitor-line bg-monitor-2 p-4" style={stagger(3)}>
            <p className="font-sub text-xs font-semibold text-monitor-dim">Hypertension · Subjective</p>
            <p className="mt-2 flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-monitor-warn" />
              Reports uncertain dose of lisinopril as 20 mg or 40 mg.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-monitor-warn/40 bg-monitor-warn/10 px-2 py-0.5 text-monitor-warn">Speaker sounded unsure</span>
              <span className="rounded-full border border-monitor-line px-2 py-0.5 font-mono text-monitor-dim">▶ u6 · 00:26</span>
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-3 gap-6">
          {PILLARS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rise" style={stagger(4 + i)}>
              <Icon className="h-5 w-5 text-monitor-trace" />
              <p className="mt-2 font-sub text-sm font-semibold">{title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-monitor-dim">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Sign-in */}
      <section className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-5 top-5 flex gap-2">
          <TrailToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="rise mb-8 lg:hidden">
            <Logo size="lg" />
            <p className="mt-3 font-sub text-ink-3">The note is where other scribes stop.</p>
          </div>
          <div className="rise mb-6 hidden lg:block" style={stagger(1)}>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.01em] text-ink">Welcome back</h2>
            <p className="mt-1 font-sub text-ink-3">Sign in to review today&apos;s visits.</p>
          </div>
          <div className="rise" style={stagger(2)}>
            <LoginForm next={nextPath} />
          </div>
          <div className="rise glass-pill mt-6 rounded-xl p-4 text-xs text-ink-3" style={stagger(3)}>
            <p className="font-sub font-semibold text-ink-2">Demo accounts (synthetic)</p>
            <p className="mt-1.5 font-mono">dr.patel@carryover.demo / demo1234</p>
            <p className="font-mono">dr.nguyen@carryover.demo / demo1234</p>
          </div>
        </div>
      </section>
    </main>
  );
}
