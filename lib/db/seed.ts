import bcrypt from "bcryptjs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Note, Section, SentenceKind, VisitType } from "@/lib/contracts";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dobForAge = (age: number, monthDay = "03-14") => `${new Date().getFullYear() - age - 1}-${monthDay}`;

type Line = [problemId: string, section: Section, text: string, kind: SentenceKind];

/** Builds a signed historical note (all sentences clinician-verified). */
function histNote(chiefComplaint: string, problems: [string, string][], lines: Line[]): Note {
  return {
    chiefComplaint,
    speakerRoles: {},
    problems: problems.map(([id, title]) => ({ id, title, status: "established" as const })),
    sentences: lines.map(([problemId, section, text, kind], i) => ({
      id: `s${i + 1}`, problemId, section, text, kind,
      sourceUtteranceIds: [], origin: "clinician" as const, review: "accepted" as const,
    })),
  };
}

interface PriorVisit {
  daysAgo: number;
  type: VisitType;
  note: Note;
  vitals: { systolic?: number; diastolic?: number; heartRate?: number; tempF?: number; spo2?: number; weightLb?: number };
}

interface SeedPatient {
  firstName: string; lastName: string; age: number; sex: "F" | "M"; email: string; lang: "en" | "es";
  meds: { name: string; dose: string; frequency: string }[]; allergies: string[];
  visits: PriorVisit[];
  openItems: { visitIndex: number; text: string; category: schema.OpenItemRow["category"]; dueInDays?: number }[];
}

function rosa(): SeedPatient {
  return {
    firstName: "Rosa", lastName: "Martinez", age: 58, sex: "F", lang: "es",
    email: process.env.DEMO_PATIENT_EMAIL || "rosa.martinez@example.com",
    meds: [{ name: "lisinopril", dose: "20 mg", frequency: "daily" }],
    allergies: ["sulfa drugs"],
    visits: [
      {
        daysAgo: 90, type: "htn_followup",
        vitals: { systolic: 156, diastolic: 96, heartRate: 78, weightLb: 172 },
        note: histNote("Elevated blood pressure", [["p1", "Essential hypertension"]], [
          ["p1", "S", "Reports occasional morning headaches; no chest pain or vision changes.", "symptom"],
          ["p1", "O", "BP 156/96.", "vital"],
          ["p1", "A", "Essential hypertension, not at goal.", "assessment"],
          ["p1", "P", "Start lisinopril 10 mg daily.", "medication"],
          ["p1", "P", "Basic metabolic panel in 2 weeks to check kidney function and potassium.", "plan"],
          ["p1", "P", "Advised low-salt diet.", "plan"],
        ]),
      },
      {
        daysAgo: 42, type: "htn_followup",
        vitals: { systolic: 146, diastolic: 90, heartRate: 74, weightLb: 170 },
        note: histNote("Hypertension follow-up", [["p1", "Essential hypertension"]], [
          ["p1", "S", "Taking lisinopril 10 mg daily; no side effects reported.", "medication"],
          ["p1", "O", "BP 146/90.", "vital"],
          ["p1", "A", "Essential hypertension, improved but not at goal.", "assessment"],
          ["p1", "P", "Increase lisinopril to 20 mg daily.", "dose"],
          ["p1", "P", "Keep a home blood pressure log and bring it to the next visit.", "plan"],
          ["p1", "P", "Follow up in 6 weeks.", "plan"],
        ]),
      },
    ],
    openItems: [
      { visitIndex: 0, text: "Review basic metabolic panel (kidney function, potassium) after lisinopril start", category: "lab" },
      { visitIndex: 1, text: "Review home BP log", category: "followup" },
    ],
  };
}

const PATEL_OTHERS: SeedPatient[] = [
  {
    firstName: "James", lastName: "Carter", age: 64, sex: "M", lang: "en", email: "james.carter@example.com",
    meds: [{ name: "metformin", dose: "1000 mg", frequency: "twice daily" }, { name: "atorvastatin", dose: "20 mg", frequency: "nightly" }],
    allergies: [],
    visits: [{
      daysAgo: 60, type: "t2dm_followup",
      vitals: { systolic: 134, diastolic: 82, heartRate: 80, weightLb: 214 },
      note: histNote("Diabetes follow-up", [["p1", "Type 2 diabetes mellitus"]], [
        ["p1", "S", "Home fasting glucose mostly 140s to 160s.", "history"],
        ["p1", "O", "A1c 7.9%.", "exam"],
        ["p1", "A", "Type 2 diabetes, above goal.", "assessment"],
        ["p1", "P", "Continue metformin 1000 mg twice daily; discussed diet and walking 30 minutes daily.", "plan"],
        ["p1", "P", "Repeat A1c in 3 months.", "plan"],
      ]),
    }],
    openItems: [{ visitIndex: 0, text: "Repeat A1c", category: "lab" }],
  },
  {
    firstName: "Aisha", lastName: "Rahman", age: 31, sex: "F", lang: "en", email: "aisha.rahman@example.com",
    meds: [], allergies: ["penicillin"],
    visits: [{
      daysAgo: 20, type: "acute_respiratory",
      vitals: { systolic: 118, diastolic: 74, heartRate: 92, tempF: 100.4, spo2: 98 },
      note: histNote("Sore throat and cough", [["p1", "Acute upper respiratory infection"]], [
        ["p1", "S", "Sore throat, congestion, and cough for 3 days.", "symptom"],
        ["p1", "O", "Temperature 100.4 F, SpO2 98%.", "vital"],
        ["p1", "A", "Viral upper respiratory infection.", "assessment"],
        ["p1", "P", "Supportive care, fluids, and rest; return if symptoms last more than 10 days.", "plan"],
      ]),
    }],
    openItems: [],
  },
];

const NGUYEN_PATIENTS: SeedPatient[] = [
  {
    firstName: "Michael", lastName: "Brooks", age: 52, sex: "M", lang: "en", email: "michael.brooks@example.com",
    meds: [{ name: "amlodipine", dose: "5 mg", frequency: "daily" }], allergies: [],
    visits: [{
      daysAgo: 30, type: "htn_followup",
      vitals: { systolic: 142, diastolic: 88, heartRate: 70 },
      note: histNote("Hypertension follow-up", [["p1", "Essential hypertension"]], [
        ["p1", "O", "BP 142/88.", "vital"],
        ["p1", "P", "Continue amlodipine 5 mg daily.", "medication"],
      ]),
    }],
    openItems: [],
  },
  {
    firstName: "Linda", lastName: "Chen", age: 47, sex: "F", lang: "en", email: "linda.chen@example.com",
    meds: [{ name: "metformin", dose: "500 mg", frequency: "twice daily" }], allergies: ["codeine"],
    visits: [{
      daysAgo: 75, type: "t2dm_followup",
      vitals: { systolic: 126, diastolic: 78, heartRate: 76 },
      note: histNote("Diabetes follow-up", [["p1", "Type 2 diabetes mellitus"]], [
        ["p1", "O", "A1c 7.2%.", "exam"],
        ["p1", "P", "Continue metformin 500 mg twice daily.", "medication"],
      ]),
    }],
    openItems: [{ visitIndex: 0, text: "Annual diabetic eye exam referral", category: "referral" }],
  },
];

async function insertPatient(db: DB, doctorId: string, p: SeedPatient) {
  const [patient] = await db.insert(schema.patients).values({
    doctorId, firstName: p.firstName, lastName: p.lastName, dob: dobForAge(p.age), sex: p.sex,
    email: p.email, preferredLanguage: p.lang, knownMedications: p.meds, knownAllergies: p.allergies,
    createdAt: daysAgo(120),
  }).returning();

  const visitIds: string[] = [];
  for (const v of p.visits) {
    const when = daysAgo(v.daysAgo);
    const [visit] = await db.insert(schema.visits).values({
      patientId: patient.id, doctorId, visitType: v.type, status: "signed",
      startedAt: when, endedAt: new Date(when.getTime() + 15 * 60_000), signedAt: new Date(when.getTime() + 25 * 60_000),
      note: v.note, gaps: [], scores: [],
    }).returning();
    visitIds.push(visit.id);
    await db.insert(schema.vitals).values({ time: when, patientId: patient.id, visitId: visit.id, ...v.vitals });
  }
  for (const item of p.openItems) {
    await db.insert(schema.openItems).values({
      patientId: patient.id, sourceVisitId: visitIds[item.visitIndex], text: item.text,
      category: item.category, status: "open", createdAt: daysAgo(p.visits[item.visitIndex].daysAgo),
    });
  }
  return patient;
}

/** Seeds doctors and synthetic patients. Backboard memory is back-filled lazily on first brief request. */
export async function seedDatabase(db: DB) {
  const hash = await bcrypt.hash("demo1234", 10);
  const [patel] = await db.insert(schema.doctors).values({
    name: "Dr. Anika Patel", email: "dr.patel@carryover.demo", passwordHash: hash, specialty: "Family Medicine",
  }).returning();
  const [nguyen] = await db.insert(schema.doctors).values({
    name: "Dr. Minh Nguyen", email: "dr.nguyen@carryover.demo", passwordHash: hash, specialty: "Internal Medicine",
  }).returning();

  await insertPatient(db, patel.id, rosa());
  for (const p of PATEL_OTHERS) await insertPatient(db, patel.id, p);
  for (const p of NGUYEN_PATIENTS) await insertPatient(db, nguyen.id, p);
  console.log("[seed] seeded 2 doctors and 5 synthetic patients");
}
