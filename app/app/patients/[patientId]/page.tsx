import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, ClipboardList, Gauge, History, Languages, Minus, Pill, ShieldAlert, Stethoscope, TriangleAlert } from "lucide-react";
import { guard } from "@/components/AccessDenied";
import { BpChart } from "@/components/BpChart";
import { CountUp } from "@/components/fx";
import { stagger } from "@/components/motion";
import { PatientAvatar, VisitTypeIcon } from "@/components/patient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPatient } from "@/lib/access";
import { snowflakeEnabled } from "@/lib/llm/snowflake";
import { visitTypeForConditions, type Sex } from "@/lib/contracts";
import { requireDoctorPage } from "@/lib/auth/current";
import { dueLabel } from "@/lib/openItems";
import { getOpenItems, getVisitHistory, getVitals } from "@/lib/queries";
import { VISIT_TYPE_LABELS, ageFromDob, cn, formatDate, sexLabel } from "@/lib/utils";
import { BriefCard } from "./BriefCard";
import { ChatCard } from "./ChatCard";
import { EditPatientButton } from "./EditPatientButton";
import { OpenItemsList } from "./OpenItemsList";
import { StartVisitButton } from "./StartVisitButton";

const STATUS_TONE = { signed: "green", sent: "teal", review: "amber", error: "red" } as const;
const STATUS_DOT = { signed: "bg-ok", sent: "bg-accent", review: "bg-warn", error: "bg-danger" } as const;

export default async function PatientPage({ params }: PageProps<"/app/patients/[patientId]">) {
  const { patientId } = await params;
  const session = await requireDoctorPage();
  const patient = await guard(() => loadPatient(patientId, session.doctorId));

  const [openItems, vitals, history] = await Promise.all([
    getOpenItems(patient.id), getVitals(patient.id), getVisitHistory(patient.id),
  ]);
  const bp = vitals.map((v) => ({ date: v.time.toISOString(), systolic: v.systolic, diastolic: v.diastolic }));

  // Display-only summary of the readings already loaded for the chart.
  const readings = bp.filter((p) => p.systolic != null && p.diastolic != null);
  const latest = readings.at(-1);
  const previous = readings.at(-2);
  const delta = latest && previous ? latest.systolic! - previous.systolic! : null;
  const lastVisit = history.find((h) => h.status === "signed" || h.status === "sent");
  const itemRows = openItems.map((item) => ({
    id: item.id, text: item.text, category: item.category,
    since: `since ${formatDate(item.createdAt, { month: "short", day: "numeric" })}`,
    due: dueLabel(item.dueDate),
  }));
  const overdue = itemRows.filter((i) => i.due?.overdue).length;

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <Link href="/app/patients" className="group inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-accent-ink">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> My patients
        </Link>

        {/* Patient header */}
        <div className="rise glass mt-3 flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6">
          <div className="flex items-center gap-5">
            <PatientAvatar first={patient.firstName} last={patient.lastName} size="lg" />
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-4xl">{patient.firstName} {patient.lastName}</h1>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
                <span>{ageFromDob(patient.dob)} y/o {sexLabel(patient.sex)}</span>
                <span className="h-1 w-1 rounded-full bg-ink-4" aria-hidden />
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-ink-3" /> DOB {formatDate(patient.dob + "T12:00:00")}</span>
                <span className="h-1 w-1 rounded-full bg-ink-4" aria-hidden />
                <span className="inline-flex items-center gap-1.5"><Languages className="h-3.5 w-3.5 text-ink-3" /> Prefers {patient.preferredLanguage === "es" ? "Spanish" : "English"}</span>
                {patient.knownAllergies.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-ink">
                    <ShieldAlert className="h-3.5 w-3.5" /> Allergy: {patient.knownAllergies.join(", ")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditPatientButton
              patientId={patient.id}
              initial={{
                firstName: patient.firstName, lastName: patient.lastName, dob: patient.dob, sex: patient.sex as Sex,
                email: patient.email ?? "", preferredLanguage: patient.preferredLanguage,
                knownMedications: patient.knownMedications.length ? patient.knownMedications : [{ name: "", dose: "", frequency: "" }],
                knownAllergies: patient.knownAllergies, conditions: patient.conditions,
              }}
            />
            {/* A patient's own history wins; before the first signed visit, their conditions pick the visit type. */}
            <StartVisitButton patientId={patient.id} lastVisitType={lastVisit?.visitType ?? visitTypeForConditions(patient.conditions, "htn_followup")} />
          </div>
        </div>

        {/* At a glance */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Glance i={1} icon={Gauge} label="Latest blood pressure" hint={latest ? formatDate(latest.date) : "No readings"}>
            {latest ? (
              <span className="flex items-baseline gap-2">
                <span><CountUp value={latest.systolic!} /><span className="text-ink-4">/</span><CountUp value={latest.diastolic!} /></span>
                <span className="text-xs font-normal text-ink-3">mmHg</span>
                {delta !== null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                      delta < 0 ? "bg-ok-soft text-ok-ink" : delta > 0 ? "bg-danger-soft text-danger-ink" : "bg-surface-3 text-ink-3",
                    )}
                    title="Systolic change since the previous reading"
                  >
                    {delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {Math.abs(delta)}
                  </span>
                )}
              </span>
            ) : "—"}
          </Glance>
          <Glance i={2} icon={ClipboardList} label="Open items" hint={overdue ? `${overdue} overdue` : "carried from past visits"} warn={openItems.length > 0}>
            <CountUp value={openItems.length} />
          </Glance>
          <Glance i={3} icon={History} label="Last signed visit" hint={lastVisit ? VISIT_TYPE_LABELS[lastVisit.visitType] : "None yet"}>
            {lastVisit ? formatDate(lastVisit.startedAt, { month: "short", day: "numeric" }) : "—"}
          </Glance>
          <Glance i={4} icon={Pill} label="Active medications" hint={patient.knownMedications.map((m) => m.name).join(", ") || "None on file"}>
            <CountUp value={patient.knownMedications.length} />
          </Glance>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <div className="rise" style={stagger(3)}>
              <BriefCard patientId={patient.id} />
            </div>

            {(snowflakeEnabled() || Boolean(process.env.GEMINI_API_KEY)) && (
              <div className="rise" style={stagger(3)}>
                <ChatCard patientId={patient.id} firstName={patient.firstName} />
              </div>
            )}

            <Card className="rise" style={stagger(4)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Open items</CardTitle>
                <span className="flex items-center gap-1.5">
                  {overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}
                  <Badge tone={openItems.length ? "amber" : "slate"}>{openItems.length} open</Badge>
                </span>
              </CardHeader>
              <CardContent className="py-2">
                <OpenItemsList patientId={patient.id} items={itemRows} />
              </CardContent>
            </Card>

            <Card className="rise" style={stagger(5)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Visit history</CardTitle>
                <span className="text-xs text-ink-3">{history.length} visit{history.length === 1 ? "" : "s"}</span>
              </CardHeader>
              <CardContent className="p-2">
                <ol className="relative">
                  {history.map((v, i) => {
                    const href = v.status === "signed" || v.status === "sent"
                      ? `/app/visits/${v.id}/note`
                      : v.status === "review" ? `/app/visits/${v.id}/review`
                      : v.status === "processing" || v.status === "error" ? `/app/visits/${v.id}/processing`
                      : `/app/visits/${v.id}/record`;
                    return (
                      <li key={v.id} className="relative">
                        {i < history.length - 1 && <span className="absolute bottom-0 left-[1.9rem] top-10 w-px bg-line" aria-hidden />}
                        <Link href={href} className="group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors hover:bg-surface-2">
                          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-3 transition-colors group-hover:border-accent group-hover:text-accent-ink">
                            <VisitTypeIcon type={v.visitType} className="h-3.5 w-3.5" />
                            <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface", STATUS_DOT[v.status as keyof typeof STATUS_DOT] ?? "bg-ink-4")} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold text-ink">{formatDate(v.startedAt)}</span>
                              <span className="text-ink-2">{VISIT_TYPE_LABELS[v.visitType]}</span>
                            </span>
                            {v.note?.chiefComplaint && <span className="block truncate text-xs text-ink-3">— {v.note.chiefComplaint}</span>}
                          </span>
                          <Badge tone={STATUS_TONE[v.status as keyof typeof STATUS_TONE] ?? "slate"}>{v.status}</Badge>
                          <ChevronRight className="h-4 w-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                        </Link>
                      </li>
                    );
                  })}
                  {history.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">No visits yet.</li>}
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card className="rise" style={stagger(4)}>
              <CardHeader>
                <CardTitle>Blood pressure trend</CardTitle>
                <span className="font-mono text-[11px] text-ink-3">mmHg</span>
              </CardHeader>
              <CardContent><BpChart points={bp} /></CardContent>
            </Card>
            <Card className="rise" style={stagger(5)}>
              <CardHeader><CardTitle className="flex items-center gap-2"><Pill className="h-4 w-4" /> Medications</CardTitle></CardHeader>
              <CardContent>
                {patient.knownMedications.length === 0 ? (
                  <p className="text-sm text-ink-3">None on file.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {patient.knownMedications.map((m, i) => (
                      <li key={`${m.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Pill className="h-4 w-4" /></span>
                        <span><span className="font-semibold capitalize text-ink">{m.name}</span> <span className="text-ink-2">{m.dose} {m.frequency}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card className="rise" style={stagger(6)}>
              <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Conditions</CardTitle></CardHeader>
              <CardContent>
                {patient.conditions.length === 0 ? (
                  <p className="text-sm text-ink-3">None recorded.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {patient.conditions.map((c) => <Badge key={c} tone="teal" className="px-2.5 py-1 text-sm">{c}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className={cn("rise", patient.knownAllergies.length > 0 && "border-danger/30")} style={stagger(7)}>
              <CardHeader><CardTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> Allergies</CardTitle></CardHeader>
              <CardContent>
                {patient.knownAllergies.length === 0 ? (
                  <p className="text-sm text-ink-3">No known allergies.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {patient.knownAllergies.map((a) => <Badge key={a} tone="red" className="px-2.5 py-1 text-sm">{a}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Glance({ i, icon: Icon, label, hint, warn, children }: {
  i: number; icon: typeof Gauge; label: string; hint: string; warn?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rise glass group rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-0.5" style={stagger(i)}>
      <p className="flex items-center gap-2 font-sub text-xs font-semibold text-ink-3">
        <Icon className={cn("h-3.5 w-3.5", warn ? "text-warn" : "text-accent")} /> {label}
      </p>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">{children}</div>
      <p className="mt-1 truncate text-xs text-ink-3" title={hint}>{hint}</p>
    </div>
  );
}
