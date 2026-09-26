import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireDoctorPage } from "@/lib/auth/current";
import { listPatients } from "@/lib/queries";
import { VISIT_TYPE_LABELS, ageFromDob, formatDate } from "@/lib/utils";

export default async function PatientsPage() {
  const session = await requireDoctorPage();
  const patients = await listPatients(session.doctorId);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">My patients</h1>
      <p className="mt-1 text-sm text-slate-600">{patients.length} assigned to {session.name}</p>
      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Age</th>
              <th className="px-4 py-3 font-medium">Last visit type</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
              <th className="px-4 py-3 font-medium">Open items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/app/patients/${p.id}`} className="font-medium text-slate-900 hover:text-accent">
                    {p.lastName}, {p.firstName}
                  </Link>
                  {p.preferredLanguage === "es" && <Badge tone="blue" className="ml-2">ES</Badge>}
                </td>
                <td className="px-4 py-3 text-slate-600">{ageFromDob(p.dob)} {p.sex}</td>
                <td className="px-4 py-3 text-slate-600">{p.lastVisitType ? VISIT_TYPE_LABELS[p.lastVisitType] : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(p.lastVisitDate)}</td>
                <td className="px-4 py-3">
                  {p.openItemCount > 0 ? <Badge tone="amber">{p.openItemCount} open</Badge> : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No patients assigned.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
