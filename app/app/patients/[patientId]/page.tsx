import Link from "next/link";
import { ClipboardList, History, Pill, TriangleAlert } from "lucide-react";
import { guard } from "@/components/AccessDenied";
import { BpChart } from "@/components/BpChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPatient } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { getOpenItems, getVisitHistory, getVitals } from "@/lib/queries";
import { VISIT_TYPE_LABELS, ageFromDob, formatDate } from "@/lib/utils";
import { BriefCard } from "./BriefCard";
import { StartVisitButton } from "./StartVisitButton";

const STATUS_TONE = { signed: "green", sent: "teal", review: "amber", error: "red" } as const;

export default async function PatientPage({ params }: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const session = await requireDoctorPage();
  const patient = await guard(() => loadPatient(patientId, session.doctorId));

  const [openItems, vitals, history] = await Promise.all([
    getOpenItems(patient.id), getVitals(patient.id), getVisitHistory(patient.id),
  ]);
  const bp = vitals.map((v) => ({ date: v.time.toISOString(), systolic: v.systolic, diastolic: v.diastolic }));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/app/patients" className="text-sm text-slate-500 hover:text-accent">← My patients</Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{patient.firstName} {patient.lastName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {ageFromDob(patient.dob)} y/o {patient.sex} · DOB {formatDate(patient.dob + "T12:00:00")} ·
            Prefers {patient.preferredLanguage === "es" ? "Spanish" : "English"}
          </p>
        </div>
        <StartVisitButton patientId={patient.id} lastVisitType={history.find((h) => h.status === "signed" || h.status === "sent")?.visitType ?? "htn_followup"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <BriefCard patientId={patient.id} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Open items</CardTitle>
              <Badge tone={openItems.length ? "amber" : "slate"}>{openItems.length} open</Badge>
            </CardHeader>
            <CardContent>
              {openItems.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing outstanding.</p>
              ) : (
                <ul className="space-y-2">
                  {openItems.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-800">{item.text}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {item.category.replace("_", " ")} · since {formatDate(item.createdAt, { month: "short", day: "numeric" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Visit history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {history.map((v) => {
                  const href = v.status === "signed" || v.status === "sent"
                    ? `/app/visits/${v.id}/note`
                    : v.status === "review" ? `/app/visits/${v.id}/review`
                    : v.status === "processing" || v.status === "error" ? `/app/visits/${v.id}/processing`
                    : `/app/visits/${v.id}/record`;
                  return (
                    <li key={v.id}>
                      <Link href={href} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50">
                        <span>
                          <span className="font-medium text-slate-900">{formatDate(v.startedAt)}</span>
                          <span className="ml-2 text-slate-600">{VISIT_TYPE_LABELS[v.visitType]}</span>
                          {v.note?.chiefComplaint && <span className="ml-2 text-slate-500">— {v.note.chiefComplaint}</span>}
                        </span>
                        <Badge tone={STATUS_TONE[v.status as keyof typeof STATUS_TONE] ?? "slate"}>{v.status}</Badge>
                      </Link>
                    </li>
                  );
                })}
                {history.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No visits yet.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Blood pressure trend</CardTitle></CardHeader>
            <CardContent><BpChart points={bp} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Pill className="h-4 w-4" /> Medications</CardTitle></CardHeader>
            <CardContent>
              {patient.knownMedications.length === 0 ? (
                <p className="text-sm text-slate-500">None on file.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {patient.knownMedications.map((m) => (
                    <li key={m.name}><span className="font-medium capitalize">{m.name}</span> <span className="text-slate-600">{m.dose} {m.frequency}</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> Allergies</CardTitle></CardHeader>
            <CardContent>
              {patient.knownAllergies.length === 0 ? (
                <p className="text-sm text-slate-500">No known allergies.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {patient.knownAllergies.map((a) => <Badge key={a} tone="red">{a}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
