"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PatientForm } from "@/components/PatientForm";
import { Button } from "@/components/ui/button";

/** The command palette's "New patient" sends this when My patients is already on screen. */
export const NEW_PATIENT_EVENT = "carryover:new-patient";

/** "Add patient" on My patients. `startOpen` comes from ?new=1 (the command palette's "New patient"). */
export function AddPatientButton({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [session, setSession] = useState(0);
  const show = () => { setSession((n) => n + 1); setOpen(true); };

  // Drop ?new=1 once the dialog is up, so a refresh or back doesn't reopen it.
  useEffect(() => {
    if (startOpen) router.replace("/app/patients", { scroll: false });
  }, [startOpen, router]);

  useEffect(() => {
    const onNew = () => { setSession((n) => n + 1); setOpen(true); };
    window.addEventListener(NEW_PATIENT_EVENT, onNew);
    return () => window.removeEventListener(NEW_PATIENT_EVENT, onNew);
  }, []);

  return (
    <>
      <Button size="lg" onClick={show}>
        <UserPlus className="h-4 w-4" /> Add patient
      </Button>
      <PatientForm key={session} mode="create" open={open} onClose={() => setOpen(false)} />
    </>
  );
}
