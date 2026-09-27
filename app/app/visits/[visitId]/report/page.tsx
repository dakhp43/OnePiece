import { notFound, redirect } from "next/navigation";
import { guard } from "@/components/AccessDenied";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { currentReport } from "@/lib/report";
import { loadReportContext } from "@/lib/report-context";
import { VISIT_TYPE_LABELS, ageFromDob, formatDate } from "@/lib/utils";
import { ReportEditor } from "./ReportEditor";

export default async function ReportPage({ params }: PageProps<"/app/visits/[visitId]/report">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status !== "signed" && visit.status !== "sent") redirect(`/app/visits/${visit.id}/review`);
  const current = currentReport(visit, patient);
  if (!current) notFound();
  const context = await loadReportContext(visit, patient);
  const visitDate = visit.startedAt ?? visit.signedAt ?? new Date();

  return (
    <ReportEditor
      visitId={visit.id}
      patientId={patient.id}
      header={{
        patient: `${patient.firstName} ${patient.lastName}`,
        dob: formatDate(`${patient.dob}T12:00:00`, { year: "numeric", month: "long", day: "numeric" }),
        ageSex: `${ageFromDob(patient.dob, visitDate)} / ${patient.sex}`,
        visitDate: formatDate(visitDate, { year: "numeric", month: "long", day: "numeric" }),
        visitType: VISIT_TYPE_LABELS[visit.visitType] ?? visit.visitType,
        signedAt: visit.signedAt ? visit.signedAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "",
        status: visit.status,
      }}
      saved={JSON.parse(JSON.stringify(current.report))}
      generated={JSON.parse(JSON.stringify(current.generated))}
      context={JSON.parse(JSON.stringify(context))}
    />
  );
}
