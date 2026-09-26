import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type {
  AuditResult, FollowThrough, GapItem, Medication, Note, OpenItemCategory, ProblemScore,
  ProcessingStep, ReviewMetrics, SignoffOverride, Transcript, Utterance, VisitRuntime, VisitStatus, VisitType,
} from "@/lib/contracts";

export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  specialty: text("specialty"),
});

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dob: date("dob").notNull(),
  sex: text("sex").notNull(),
  email: text("email"),
  preferredLanguage: text("preferred_language").$type<"en" | "es">().notNull().default("en"),
  knownMedications: jsonb("known_medications").$type<Medication[]>().notNull().default(sql`'[]'::jsonb`),
  knownAllergies: jsonb("known_allergies").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  backboardAssistantId: text("backboard_assistant_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("patients_language_check", sql`${t.preferredLanguage} in ('en', 'es')`)]);

export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  visitType: text("visit_type").$type<VisitType>().notNull(),
  status: text("status").$type<VisitStatus>().notNull().default("created"),
  processingStep: text("processing_step").$type<ProcessingStep | null>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  audioPath: text("audio_path"),
  transcript: jsonb("transcript").$type<Transcript>(),
  utterances: jsonb("utterances").$type<Utterance[]>(),
  note: jsonb("note").$type<Note>(),
  audit: jsonb("audit").$type<AuditResult>(),
  gaps: jsonb("gaps").$type<GapItem[]>(),
  scores: jsonb("scores").$type<ProblemScore[]>(),
  followthrough: jsonb("followthrough").$type<FollowThrough>(),
  metrics: jsonb("metrics").$type<Partial<ReviewMetrics> & VisitRuntime>(),
  signoffOverrides: jsonb("signoff_overrides").$type<SignoffOverride[]>(),
}, (t) => [index("visits_patient_idx").on(t.patientId)]);

export const openItems = pgTable("open_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  sourceVisitId: uuid("source_visit_id").references(() => visits.id),
  text: text("text").notNull(),
  category: text("category").$type<OpenItemCategory>().notNull(),
  dueDate: date("due_date"),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  closedVisitId: uuid("closed_visit_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("open_items_patient_idx").on(t.patientId)]);

/** Hypertable on `time` (see scripts/migrate.ts). No primary key: hypertable unique keys must include time. */
export const vitals = pgTable("vitals", {
  time: timestamp("time", { withTimezone: true }).notNull(),
  patientId: uuid("patient_id").notNull(),
  visitId: uuid("visit_id"),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  heartRate: integer("heart_rate"),
  tempF: numeric("temp_f", { mode: "number" }),
  spo2: integer("spo2"),
  weightLb: numeric("weight_lb", { mode: "number" }),
}, (t) => [index("vitals_patient_time_idx").on(t.patientId, t.time)]);

export type EventType =
  | "recording_started" | "recording_ended" | "note_drafted" | "sentence_accepted"
  | "sentence_edited" | "sentence_deleted" | "sentence_added" | "gap_filled"
  | "gap_dismissed" | "gap_deferred" | "signoff_override" | "signed"
  | "summary_edited" | "email_sent";

/** Hypertable on `time`: audit trail of every AI draft, clinician edit, and override. */
export const events = pgTable("events", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  visitId: uuid("visit_id"),
  doctorId: uuid("doctor_id"),
  type: text("type").$type<EventType>().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
}, (t) => [index("events_visit_time_idx").on(t.visitId, t.time)]);

export type DoctorRow = typeof doctors.$inferSelect;
export type PatientRow = typeof patients.$inferSelect;
export type VisitRow = typeof visits.$inferSelect;
export type OpenItemRow = typeof openItems.$inferSelect;
export type VitalsRow = typeof vitals.$inferSelect;
