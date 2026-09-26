import Link from "next/link";
import { redirect } from "next/navigation";
import { guard } from "@/components/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { SECTION_LABELS, groupNote } from "@/lib/note";
import { VISIT_TYPE_LABELS, formatDate } from "@/lib/utils";

export default async function SignedNotePage({ params }: PageProps<"/app/visits/[visitId]/note">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status !== "signed" && visit.status !== "sent") redirect(`/app/visits/${visit.id}/review`);
  const note = visit.note;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <Link href={`/app/patients/${patient.id}`} className="text-sm text-slate-500 hover:text-accent">
        ← {patient.firstName} {patient.lastName}
      </Link>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{VISIT_TYPE_LABELS[visit.visitType]}</h1>
        <div className="flex items-center gap-2">
          {visit.followthrough && (
            <Link href={`/app/visits/${visit.id}/followthrough`} className="text-sm font-medium text-accent hover:underline">
              Follow-through →
            </Link>
          )}
          <Badge tone={visit.status === "sent" ? "teal" : "green"}>{visit.status}</Badge>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Visit {formatDate(visit.startedAt)} · Signed {formatDate(visit.signedAt)} · Read-only
      </p>
      {!note ? (
        <p className="mt-8 text-slate-500">No note on file.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm"><span className="font-medium text-slate-700">Chief complaint:</span> {note.chiefComplaint}</p>
          {groupNote(note).map(({ problem, sections }) => (
            <Card key={problem.id}>
              <CardHeader><CardTitle className="normal-case tracking-normal text-slate-900 text-base">{problem.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sections.filter((s) => s.sentences.length).map(({ section, sentences }) => (
                  <div key={section}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{SECTION_LABELS[section]}</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
                      {sentences.map((s) => (
                        <li key={s.id}>
                          {s.text}
                          {s.origin === "clinician" && s.sourceUtteranceIds.length === 0 && visit.utterances && (
                            <span className="ml-1 text-xs text-slate-400">(added by clinician)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {visit.signoffOverrides && visit.signoffOverrides.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader><CardTitle>Sign-off overrides</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {visit.signoffOverrides.map((o) => <li key={o.itemId}>{o.label} — <span className="text-slate-600">{o.reason.replace("_", " ")}</span></li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
