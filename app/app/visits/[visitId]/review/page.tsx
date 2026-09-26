import { redirect } from "next/navigation";
import { guard } from "@/components/AccessDenied";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { visitView } from "@/lib/visits";
import { Review } from "./Review";

export default async function ReviewPage({ params }: PageProps<"/app/visits/[visitId]/review">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status === "signed" || visit.status === "sent") redirect(`/app/visits/${visit.id}/followthrough`);
  if (visit.status !== "review") redirect(`/app/visits/${visit.id}/processing`);
  // JSON round-trip so the client gets the same shape as API responses.
  return <Review initial={JSON.parse(JSON.stringify(visitView(visit, patient)))} />;
}
