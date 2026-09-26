import { guard } from "@/components/AccessDenied";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { Processing } from "./Processing";

export default async function ProcessingPage({ params }: PageProps<"/app/visits/[visitId]/processing">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  return <Processing visitId={visit.id} patientName={`${patient.firstName} ${patient.lastName}`} />;
}
