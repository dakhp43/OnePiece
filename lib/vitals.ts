import type { Note, VitalsInput } from "@/lib/contracts";
import { liveSentences } from "@/lib/note";

/**
 * Pulls vitals stated in the signed note's Objective sentences (e.g. "BP 138/88.") so the
 * BP trend stays current even when the doctor didn't type vitals in the start-visit dialog.
 * Deterministic: only numbers that are literally in the signed note.
 */
export function vitalsFromNote(note: Note): VitalsInput {
  const text = liveSentences(note)
    .filter((s) => s.section === "O" || s.kind === "vital")
    .map((s) => s.text)
    .join(" ");
  const out: VitalsInput = {};
  const bp = /\b(?:BP|blood pressure)\D{0,12}?(\d{2,3})\s*\/\s*(\d{2,3})\b/i.exec(text) ?? /\b(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mm\s*Hg)?\b/i.exec(text);
  if (bp) {
    const [sys, dia] = [Number(bp[1]), Number(bp[2])];
    if (sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160 && sys > dia) Object.assign(out, { systolic: sys, diastolic: dia });
  }
  const hr = /\b(?:HR|heart rate|pulse)\D{0,8}?(\d{2,3})\b/i.exec(text);
  if (hr && +hr[1] >= 30 && +hr[1] <= 220) out.heartRate = +hr[1];
  const spo2 = /\b(?:SpO2|O2 sat(?:uration)?|oxygen saturation)\D{0,8}?(\d{2,3})\s*%/i.exec(text);
  if (spo2 && +spo2[1] >= 50 && +spo2[1] <= 100) out.spo2 = +spo2[1];
  const temp = /\b(?:temp(?:erature)?)\D{0,8}?(\d{2,3}(?:\.\d)?)\s*(?:°?\s*F)?\b/i.exec(text);
  if (temp && +temp[1] >= 90 && +temp[1] <= 110) out.tempF = +temp[1];
  const wt = /\b(?:weight|wt)\D{0,8}?(\d{2,3}(?:\.\d)?)\s*(?:lb|lbs|pounds)\b/i.exec(text);
  if (wt) out.weightLb = +wt[1];
  return out;
}
