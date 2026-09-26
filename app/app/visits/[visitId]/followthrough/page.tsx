import { redirect } from "next/navigation";
import { guard } from "@/components/AccessDenied";
import { loadVisit } from "@/lib/access";
import { requireDoctorPage } from "@/lib/auth/current";
import { visitView } from "@/lib/visits";
import { FollowThroughView } from "./FollowThroughView";

export default async function FollowThroughPage({ params }: PageProps<"/app/visits/[visitId]/followthrough">) {
  const { visitId } = await params;
  const session = await requireDoctorPage();
  const { visit, patient } = await guard(() => loadVisit(visitId, session.doctorId));
  if (visit.status !== "signed" && visit.status !== "sent") redirect(`/app/visits/${visit.id}/review`);
  return <FollowThroughView initial={JSON.parse(JSON.stringify(visitView(visit, patient)))} />;
}
