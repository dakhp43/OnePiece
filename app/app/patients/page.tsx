import Link from "next/link";
import { ChevronRight, ClipboardList, Languages, Users } from "lucide-react";
import { AddPatientButton } from "@/components/AddPatientButton";
import { CountUp } from "@/components/fx";
import { stagger } from "@/components/motion";
import { PatientAvatar, VisitTypeIcon } from "@/components/patient";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireDoctorPage } from "@/lib/auth/current";
import { listPatients } from "@/lib/queries";
import { VISIT_TYPE_LABELS, ageFromDob, formatDate, sexLabel } from "@/lib/utils";

const COLS = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_1.25rem] items-center gap-4";

export default async function PatientsPage({ searchParams }: PageProps<"/app/patients">) {
  const session = await requireDoctorPage();
  const { new: openNew } = await searchParams;
  const patients = await listPatients(session.doctorId);
  const openTotal = patients.reduce((n, p) => n + p.openItemCount, 0);
  const spanish = patients.filter((p) => p.preferredLanguage === "es").length;

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="rise flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-sub text-sm font-semibold text-accent-ink">Patient panel</p>
            <h1 className="mt-1 font-display text-4xl font-semibold leading-tight tracking-[-0.01em] text-ink">My patients</h1>
            <p className="mt-2 font-sub text-sm text-ink-3">{patients.length} assigned to {session.name}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:gap-3">
              <Stat icon={Users} value={patients.length} label="patients" />
              <Stat icon={ClipboardList} value={openTotal} label="open items" tone={openTotal ? "warn" : "default"} />
              <Stat icon={Languages} value={spanish} label="prefer Spanish" />
            </div>
            <AddPatientButton startOpen={openNew === "1"} />
          </div>
        </div>

        <Card className="rise mt-8 overflow-hidden" style={stagger(1)}>
          <div className={`${COLS} hidden border-b border-line bg-surface-3 px-5 py-3 font-sub text-xs font-semibold text-ink-3 md:grid`} aria-hidden>
            <span>Name</span>
            <span>Age</span>
            <span>Last visit type</span>
            <span>Last visit</span>
            <span>Open items</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {patients.map((p, i) => (
              <li key={p.id} className="rise" style={stagger(i + 2)}>
                <Link
                  href={`/app/patients/${p.id}`}
                  className={`group ${COLS} relative px-5 py-4 text-sm transition-colors hover:bg-accent-soft/50 focus-visible:bg-accent-soft/50 focus-visible:outline-none`}
                >
                  <span className="absolute inset-y-0 left-0 w-0.5 origin-center scale-y-0 bg-accent transition-transform duration-300 group-hover:scale-y-100" aria-hidden />
                  <span className="flex min-w-0 items-center gap-3">
                    <PatientAvatar first={p.firstName} last={p.lastName} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink transition-colors group-hover:text-accent-ink">
                          {p.lastName}, {p.firstName}
                        </span>
                        {p.preferredLanguage === "es" && <Badge tone="blue">ES</Badge>}
                      </span>
                      {p.conditions.length > 0 && (
                        <span className="block truncate text-xs text-ink-3">
                          {p.conditions.slice(0, 2).join(", ")}{p.conditions.length > 2 ? ` +${p.conditions.length - 2}` : ""}
                        </span>
                      )}
                      <span className="text-xs text-ink-3 md:hidden">
                        {ageFromDob(p.dob)} {sexLabel(p.sex)} · {p.lastVisitType ? VISIT_TYPE_LABELS[p.lastVisitType] : "No visits"}
                      </span>
                    </span>
                  </span>
                  <span className="hidden tabular-nums text-ink-2 md:block">{ageFromDob(p.dob)} {sexLabel(p.sex)}</span>
                  <span className="hidden min-w-0 items-center gap-2 text-ink-2 md:flex">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-3 transition-colors group-hover:bg-accent/15 group-hover:text-accent-ink">
                      <VisitTypeIcon type={p.lastVisitType} className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate">{p.lastVisitType ? VISIT_TYPE_LABELS[p.lastVisitType] : "—"}</span>
                  </span>
                  <span className="hidden tabular-nums text-ink-2 md:block">{formatDate(p.lastVisitDate)}</span>
                  <span className="hidden md:block">
                    {p.openItemCount > 0 ? (
                      <Badge tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-warn" />{p.openItemCount} open</Badge>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-4 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            ))}
            {patients.length === 0 && <li className="px-5 py-12 text-center text-ink-3">No patients yet. Use Add patient to register your first.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone = "default" }: { icon: typeof Users; value: number; label: string; tone?: "default" | "warn" }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-3 py-3 transition-transform hover:-translate-y-0.5 sm:px-4">
      <span className={tone === "warn" ? "hidden h-9 w-9 items-center justify-center rounded-xl bg-warn-soft text-warn-ink sm:flex" : "hidden h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink sm:flex"}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-mono text-xl font-semibold leading-none tabular-nums text-ink"><CountUp value={value} /></p>
        <p className="mt-1 text-[11px] text-ink-3">{label}</p>
      </div>
    </div>
  );
}
