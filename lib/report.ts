import type { Note, Report, Section } from "@/lib/contracts";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import { ageFromDob } from "@/lib/utils";

type PatientBasics = Pick<PatientRow, "firstName" | "lastName" | "dob" | "sex">;

/** "Hypertension follow-up" -> "hypertension follow-up", but leaves acronyms ("BP check") alone. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const withPeriod = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * Builds the report narrative from the signed note. Deterministic (no model call): every line comes
 * from a sentence the clinician reviewed. Deleted sentences are left out; edited ones use the edit.
 */
export function buildReport(note: Note, patient: PatientBasics, visitDate: Date): Report {
  const live = note.sentences.filter((s) => s.review !== "deleted" && s.text.trim());
  const lines = (problemId: string, section: Section) =>
    live.filter((s) => s.problemId === problemId && s.section === section).map((s) => withPeriod(s.text.trim()));

  const age = ageFromDob(patient.dob, visitDate);
  const sex = patient.sex === "F" ? "female" : patient.sex === "M" ? "male" : "patient";
  const cc = note.chiefComplaint.trim();
  const opener = `${patient.firstName} ${patient.lastName} is a ${age}-year-old ${sex} seen for ${withPeriod(lowerFirst(cc))}`;
  const history = note.problems
    .map((p) => ({ title: p.title, text: lines(p.id, "S").join(" ") }))
    .filter((p) => p.text)
    .map((p) => `${p.title}: ${p.text}`);

  return {
    chiefComplaint: cc,
    hpi: [opener, ...history].join("\n\n"),
    examination: note.problems.flatMap((p) => lines(p.id, "O")).join(" "),
    problems: note.problems
      .map((p) => ({ problemId: p.id, title: p.title, assessment: lines(p.id, "A").join(" "), plan: lines(p.id, "P").join("\n") }))
      .filter((p) => p.assessment || p.plan || live.some((s) => s.problemId === p.problemId)),
    additionalNotes: "",
  };
}

/** Editable fields of a report, as flat keys (used to tell which ones the clinician changed). */
export function reportFields(r: Report): Record<string, string> {
  const out: Record<string, string> = {
    chiefComplaint: r.chiefComplaint, hpi: r.hpi, examination: r.examination, additionalNotes: r.additionalNotes,
  };
  for (const p of r.problems) {
    out[`${p.problemId}.assessment`] = p.assessment;
    out[`${p.problemId}.plan`] = p.plan;
  }
  return out;
}

export function changedFields(a: Report, b: Report) {
  const fa = reportFields(a);
  const fb = reportFields(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => (fa[k] ?? "") !== (fb[k] ?? ""));
}

/** The saved report, or one generated from the signed note if the clinician hasn't edited it yet. */
export function currentReport(visit: VisitRow, patient: PatientRow): { report: Report; generated: Report } | null {
  if (!visit.note) return null;
  const generated = buildReport(visit.note, patient, visit.startedAt ?? visit.signedAt ?? new Date());
  return { report: visit.report ?? generated, generated };
}
