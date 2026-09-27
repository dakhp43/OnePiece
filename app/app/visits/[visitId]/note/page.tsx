import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText, Lock, ShieldAlert, Stethoscope } from "lucide-react";
import { guard } from "@/components/AccessDenied";
import { Logo } from "@/components/brand";
import { stagger } from "@/components/motion";
import { VisitSteps } from "@/components/VisitSteps";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { SECTION_LABELS, groupNote } from "@/lib/note";
import { VISIT_TYPE_LABELS, cn, formatDate } from "@/lib/utils";

const SECTION_CHIP = {
  S: "bg-info-soft text-info-ink",
  O: "bg-accent-soft text-accent-ink",
  A: "bg-warn-soft text-warn-ink",
  P: "bg-ok-soft text-ok-ink",
} as const;

export default async function SignedNotePage({ params }: PageProps<"/app/visits/[visitId]/note">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status !== "signed" && visit.status !== "sent") redirect(`/app/visits/${visit.id}/review`);
  const note = visit.note;

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/app/patients/${patient.id}`} className="group inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-accent-ink">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {patient.firstName} {patient.lastName}
          </Link>
          <VisitSteps at="signed" />
        </div>

        <article className="rise glass-strong mt-4 overflow-hidden rounded-3xl">
          <div className="h-1 bg-accent" aria-hidden />
          {/* Letterhead */}
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line px-8 py-6">
            <div>
              <Logo />
              <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink">{VISIT_TYPE_LABELS[visit.visitType]}</h1>
              <p className="mt-2 text-sm text-ink-2">
                {patient.firstName} {patient.lastName} · Visit {formatDate(visit.startedAt)} · Signed {formatDate(visit.signedAt)} · Read-only
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="slate"><Lock className="h-3 w-3" /> read-only</Badge>
                <Badge tone={visit.status === "sent" ? "teal" : "green"}>{visit.status}</Badge>
              </div>
              <Link href={`/app/visits/${visit.id}/report`} className="group inline-flex items-center gap-1.5 rounded-full bg-accent-strong px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90">
                <FileText className="h-3.5 w-3.5" /> Clinical report
              </Link>
              {visit.followthrough && (
                <Link href={`/app/visits/${visit.id}/followthrough`} className="group inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/20">
                  Follow-through <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </header>

          {/* Signature seal */}
          <div className="pop pointer-events-none absolute right-8 top-40 hidden rotate-[-8deg] sm:block" style={{ animationDelay: "0.5s" }} aria-hidden>
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-[3px] border-double border-ok/60 text-center text-ok-ink opacity-80">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Signed</span>
              <span className="px-2 text-sm font-semibold leading-tight">{session.name.replace(/^Dr\.?\s+/i, "Dr. ")}</span>
              <span className="font-mono text-[10px]">{formatDate(visit.signedAt, { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
          </div>

          <div className="px-8 py-6">
            {!note ? (
              <p className="text-ink-3">No note on file.</p>
            ) : (
              <div className="space-y-5">
                <p className="flex items-center gap-3 text-sm text-ink-2 sm:pr-36">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Stethoscope className="h-4 w-4" /></span>
                  <span><span className="font-semibold text-ink">Chief complaint:</span> {note.chiefComplaint}</span>
                </p>
                {groupNote(note).map(({ problem, sections }, i) => (
                  <section key={problem.id} className="rise rounded-2xl border border-line bg-surface-3 p-5" style={stagger(i + 1)}>
                    <h2 className="font-sub text-lg font-semibold text-ink">{problem.title}</h2>
                    <div className="mt-3 space-y-3">
                      {sections.filter((s) => s.sentences.length).map(({ section, sentences }) => (
                        <div key={section} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                          <span className={cn("mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold", SECTION_CHIP[section])} title={SECTION_LABELS[section]}>
                            {section}
                          </span>
                          <div>
                            <p className="font-sub text-xs font-semibold text-ink-3">{SECTION_LABELS[section]}</p>
                            <ul className="mt-1 space-y-1 text-[15px] leading-relaxed text-ink">
                              {sentences.map((s) => (
                                <li key={s.id}>
                                  {s.text}
                                  {s.origin === "clinician" && s.sourceUtteranceIds.length === 0 && visit.utterances && (
                                    <span className="ml-1.5 rounded bg-accent-soft px-1 py-px text-[11px] text-accent-ink">(added by clinician)</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                {visit.signoffOverrides && visit.signoffOverrides.length > 0 && (
                  <Card className="border-warn/40 bg-warn-soft/40 shadow-none">
                    <CardHeader className="border-warn/25">
                      <CardTitle className="flex items-center gap-2 text-warn-ink"><ShieldAlert className="h-4 w-4" /> Sign-off overrides</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm">
                        {visit.signoffOverrides.map((o) => <li key={o.itemId} className="text-ink">{o.label} — <span className="text-ink-3">{o.reason.replace("_", " ")}</span></li>)}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
