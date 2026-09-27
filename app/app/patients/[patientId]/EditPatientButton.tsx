"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { PatientForm, type PatientFormValues } from "@/components/PatientForm";
import { Button } from "@/components/ui/button";

/** "Edit" on the patient page: the Add patient form, prefilled with what's on file. */
export function EditPatientButton({ patientId, initial }: { patientId: string; initial: PatientFormValues }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button size="lg" variant="secondary" onClick={() => { setSession((n) => n + 1); setOpen(true); }}>
        <Pencil className="h-4 w-4" /> Edit
      </Button>
      <PatientForm key={session} mode="edit" patientId={patientId} initial={initial} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
