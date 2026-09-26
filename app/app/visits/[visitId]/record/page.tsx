import { redirect } from "next/navigation";
import { guard } from "@/components/AccessDenied";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { demoFallbackEnabled } from "@/lib/fixtures";
import { VISIT_TYPE_LABELS } from "@/lib/utils";
import { Recorder } from "./Recorder";

export default async function RecordPage({ params }: PageProps<"/app/visits/[visitId]/record">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status === "processing") redirect(`/app/visits/${visit.id}/processing`);
  if (visit.status === "review") redirect(`/app/visits/${visit.id}/review`);
  if (visit.status === "signed" || visit.status === "sent") redirect(`/app/visits/${visit.id}/note`);

  return (
    <Recorder
      visitId={visit.id}
      patientId={patient.id}
      patientName={`${patient.firstName} ${patient.lastName}`}
      visitTypeLabel={VISIT_TYPE_LABELS[visit.visitType]}
      demoEnabled={demoFallbackEnabled()}
    />
  );
}
