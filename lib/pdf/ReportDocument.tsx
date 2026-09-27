import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Report, TaskCategory } from "@/lib/contracts";
import type { ReportContext } from "@/lib/report-context";

// Latin Modern, LaTeX's default typeface (GUST Font License, see fonts/GUST-FONT-LICENSE.txt).
const FONTS = path.join(process.cwd(), "lib", "pdf", "fonts");
Font.register({
  family: "Latin Modern",
  fonts: [
    { src: path.join(FONTS, "lmroman10-regular.otf") },
    { src: path.join(FONTS, "lmroman10-bold.otf"), fontWeight: "bold" },
    { src: path.join(FONTS, "lmroman10-italic.otf"), fontStyle: "italic" },
    { src: path.join(FONTS, "lmroman10-bolditalic.otf"), fontWeight: "bold", fontStyle: "italic" },
  ],
});
Font.register({ family: "Latin Modern Caps", src: path.join(FONTS, "lmromancaps10-regular.otf") });

const INK = "#111111";
const MUTED = "#4a4a4a";
const FAINT = "#7a7a7a";
const RULE = "#1a1a1a";
const HAIR = "#a3a3a3";
const ACCENT = "#134e4a";
const ALERT = "#8a1c1c";

const MARGIN = 60;
const PAGE_HEIGHT = 792; // US Letter, in points

const STATUS = { new: "New", changed: "Dose changed", stopped: "Discontinued", continue: "Continued" } as const;
const CATEGORY: Record<TaskCategory, string> = {
  lab: "Laboratory", imaging: "Imaging", referral: "Referral", medication: "Medication", followup: "Follow-up", education: "Education",
};

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 58, paddingHorizontal: MARGIN, fontFamily: "Latin Modern", fontSize: 10.5, lineHeight: "13.4pt", color: INK },

  letterhead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  clinic: { fontFamily: "Latin Modern Caps", fontSize: 15, letterSpacing: 0.6, color: ACCENT, lineHeight: "17pt" },
  dept: { fontStyle: "italic", fontSize: 9.5, color: MUTED },
  docTitle: { fontWeight: "bold", fontSize: 15, textAlign: "right", lineHeight: "17pt" },
  docMeta: { fontSize: 9.5, color: MUTED, textAlign: "right" },
  ruleThick: { borderTopWidth: 1.1, borderTopColor: RULE, marginTop: 6 },
  ruleThin: { borderTopWidth: 0.4, borderTopColor: RULE, marginTop: 1.6 },

  idBlock: { flexDirection: "row", marginTop: 8, gap: 24 },
  idCol: { flex: 1 },
  field: { flexDirection: "row", marginBottom: 1.5 },
  fieldLabel: { width: 82, fontFamily: "Latin Modern Caps", fontSize: 9.5, color: MUTED },
  fieldValue: { flex: 1 },
  idWide: { marginTop: 2 },
  allergy: { fontWeight: "bold", color: ALERT },
  idEnd: { borderTopWidth: 0.4, borderTopColor: RULE, marginTop: 8 },

  section: { marginTop: 12 },
  h: { fontFamily: "Latin Modern Caps", fontSize: 12.5, letterSpacing: 0.3, color: ACCENT, marginBottom: 4, lineHeight: "15pt" },
  p: { textAlign: "justify", marginBottom: 4 },
  runIn: { fontStyle: "italic" },
  muted: { color: MUTED },
  note: { fontStyle: "italic", fontSize: 9, color: MUTED, marginTop: 3 },

  table: { borderTopWidth: 0.8, borderTopColor: RULE, borderBottomWidth: 0.8, borderBottomColor: RULE },
  tr: { flexDirection: "row", paddingVertical: 2.5, gap: 8 },
  thead: { borderBottomWidth: 0.4, borderBottomColor: RULE },
  th: { fontFamily: "Latin Modern Caps", fontSize: 9.5 },

  problem: { marginBottom: 7 },
  problemTitle: { fontWeight: "bold", fontSize: 11, marginBottom: 1.5 },
  item: { flexDirection: "row", paddingLeft: 12 },
  mark: { width: 12 },

  signBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 },
  signLine: { borderTopWidth: 0.6, borderTopColor: RULE, width: 220, marginBottom: 3 },
  provenance: { fontStyle: "italic", fontSize: 8.5, color: MUTED, width: 260, textAlign: "right", lineHeight: "11pt" },

  running: { position: "absolute", top: 28, left: MARGIN, right: MARGIN },
  runningRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: FAINT, borderBottomWidth: 0.4, borderBottomColor: HAIR, paddingBottom: 3 },
  // Anchored from the top: with a point line height on the page, react-pdf draws a bottom-anchored footer off the page.
  footer: { position: "absolute", top: PAGE_HEIGHT - 46, left: MARGIN, right: MARGIN, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: FAINT, borderTopWidth: 0.4, borderTopColor: HAIR, paddingTop: 4 },
});

export interface ReportDocumentProps {
  report: Report;
  context: ReportContext;
  patient: { name: string; /** "Martinez, Rosa" */ sortName: string; dob: string; dobShort: string; age: number; sex: string; id: string; conditions: string[] };
  visit: { date: string; type: string; signedAt: string; status: string; editedAt: string | null };
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const capitalize = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const dueLabel = (days: number | null) =>
  days == null ? "—" : days >= 14 && days % 7 === 0 ? `in ${days / 7} weeks` : `in ${days} day${days === 1 ? "" : "s"}`;

/** "Cough: reports a dry cough…" sets the short label before the colon in italics, like a run-in heading. */
function Paragraph({ text }: { text: string }) {
  const m = /^([^:.]{1,40}:)\s+(.+)$/.exec(text);
  return m ? <Text style={s.p}><Text style={s.runIn}>{m[1]}</Text> {m[2]}</Text> : <Text style={s.p}>{text}</Text>;
}

function Section({ title, children, keep = true }: { title: string; children: React.ReactNode; keep?: boolean }) {
  return (
    <View style={s.section} wrap={!keep}>
      <Text style={s.h} minPresenceAhead={40}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{children}</Text>
    </View>
  );
}

/** A LaTeX "booktabs" table: heavy top and bottom rules, a thin rule under the header, no vertical lines. */
function Table({ columns, rows }: { columns: { label: string; flex: number }[]; rows: { cells: React.ReactNode[]; muted?: boolean }[] }) {
  return (
    <View style={s.table}>
      <View style={[s.tr, s.thead]}>
        {columns.map((c) => <Text key={c.label} style={[s.th, { flex: c.flex }]}>{c.label}</Text>)}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {r.cells.map((cell, j) => <Text key={j} style={[{ flex: columns[j].flex }, r.muted ? s.muted : {}]}>{cell}</Text>)}
        </View>
      ))}
    </View>
  );
}

export function ReportDocument({ report, context, patient, visit }: ReportDocumentProps) {
  const v = context.vitals;
  const unit = (value: number | null, suffix: string) => (value != null ? `${value} ${suffix}` : "—");
  const meds = context.medications;

  return (
    <Document title={`Clinical visit report: ${patient.name}, ${visit.date}`} author={context.doctorName} subject="Clinical visit report" creator="Carryover">
      <Page size="LETTER" style={s.page}>
        <View style={s.footer} fixed>
          <Text>Carryover Demo Clinic · Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        {/* Running header from page 2 on, so every page names the patient. */}
        <View style={s.running} fixed render={({ pageNumber }) => pageNumber > 1 && (
          <View style={s.runningRow}>
            <Text>{patient.sortName} · DOB {patient.dobShort} · ID {patient.id}</Text>
            <Text>Clinical visit report · {visit.date}</Text>
          </View>
        )} />

        <View style={s.letterhead}>
          <View>
            <Text style={s.clinic}>Carryover Demo Clinic</Text>
            <Text style={s.dept}>{context.doctorSpecialty ?? "Primary care"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.docTitle}>Clinical Visit Report</Text>
            <Text style={s.docMeta}>{visit.status}</Text>
          </View>
        </View>
        <View style={s.ruleThick} />
        <View style={s.ruleThin} />

        <View style={s.idBlock}>
          <View style={s.idCol}>
            <Field label="Patient"><Text style={{ fontWeight: "bold" }}>{patient.name}</Text></Field>
            <Field label="Date of birth">{patient.dob} ({patient.age} years)</Field>
            <Field label="Sex">{patient.sex}</Field>
            <Field label="Patient ID">{patient.id}</Field>
          </View>
          <View style={s.idCol}>
            <Field label="Encounter">{visit.date}</Field>
            <Field label="Visit type">{visit.type}</Field>
            <Field label="Clinician">{context.doctorName}</Field>
            <Field label="Signed">{visit.signedAt}</Field>
          </View>
        </View>
        <View style={s.idWide}>
          <Field label="Allergies">
            {context.allergies.length ? <Text style={s.allergy}>{context.allergies.map(capitalize).join(", ")}</Text> : "No known drug allergies"}
          </Field>
          <Field label="Conditions">{patient.conditions.length ? patient.conditions.join(", ") : <Text style={s.muted}>None recorded</Text>}</Field>
        </View>
        <View style={s.idEnd} />

        <Section title="Chief Complaint">
          <Text style={s.p}>{capitalize(report.chiefComplaint) || "—"}</Text>
        </Section>

        <Section title="History of Present Illness" keep={false}>
          {lines(report.hpi).map((p, i) => <Paragraph key={i} text={p} />)}
        </Section>

        <Section title="Vital Signs">
          {v ? (
            <Table
              columns={[{ label: "Blood pressure", flex: 1.2 }, { label: "Heart rate", flex: 1 }, { label: "Temperature", flex: 1 }, { label: "SpO2", flex: 0.8 }, { label: "Weight", flex: 0.9 }]}
              rows={[{ cells: [v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic} mmHg` : "—", unit(v.heartRate, "bpm"), unit(v.tempF, "°F"), v.spo2 != null ? `${v.spo2}%` : "—", unit(v.weightLb, "lb")] }]}
            />
          ) : <Text style={s.muted}>No vital signs were recorded for this visit.</Text>}
        </Section>

        {report.examination.trim() && (
          <Section title="Examination and Findings" keep={false}>
            {lines(report.examination).map((p, i) => <Paragraph key={i} text={p} />)}
          </Section>
        )}

        <Section title={meds.reconciled ? "Medications After This Visit" : "Medications on File"}>
          {meds.list.length === 0 ? <Text style={s.muted}>None on file.</Text> : (
            <Table
              columns={[{ label: "Medication", flex: 2 }, { label: "Dose", flex: 1.2 }, { label: "Frequency", flex: 1.8 }, ...(meds.reconciled ? [{ label: "Status", flex: 1.3 }] : [])]}
              rows={meds.list.map(({ med, change }) => ({
                muted: change === "stopped",
                cells: [
                  capitalize(med.name), med.dose || "—", med.frequency || "—",
                  ...(meds.reconciled ? [<Text key="status" style={{ fontStyle: "italic" }}>{STATUS[change]}</Text>] : []),
                ],
              }))}
            />
          )}
          {!meds.reconciled && <Text style={s.note}>Current chart list; no medication reconciliation was recorded for this visit.</Text>}
        </Section>

        <View style={s.section}>
          {report.problems.length === 0 && <Text style={s.h}>Assessment and Plan</Text>}
          {report.problems.map((p, i) => (
            <View key={p.problemId} style={s.problem} wrap={false}>
              {/* The heading travels with the first problem so it is never left alone at the foot of a page. */}
              {i === 0 && <Text style={s.h}>Assessment and Plan</Text>}
              <Text style={s.problemTitle}>{i + 1}. {p.title}</Text>
              {p.assessment.trim() && <Text style={s.p}><Text style={s.runIn}>Assessment:</Text> {p.assessment}</Text>}
              {lines(p.plan).length > 0 && (
                <View>
                  <Text style={s.runIn}>Plan:</Text>
                  {lines(p.plan).map((l, j) => (
                    <View key={j} style={s.item}><Text style={s.mark}>•</Text><Text style={{ flex: 1 }}>{l}</Text></View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {context.tasks && context.tasks.length > 0 && (
          <Section title="Orders and Follow-up">
            <Table
              columns={[{ label: "Order", flex: 4 }, { label: "Type", flex: 1.3 }, { label: "Due", flex: 1.1 }]}
              rows={context.tasks.map((t) => ({ cells: [t.description, CATEGORY[t.category], dueLabel(t.dueInDays)] }))}
            />
          </Section>
        )}

        {(context.overrides.length > 0 || context.deferred.length > 0) && (
          <Section title="Items Not Addressed at This Visit">
            {context.overrides.map((o) => (
              <View key={o.itemId} style={s.item}>
                <Text style={s.mark}>•</Text>
                <Text style={{ flex: 1 }}>{o.label} <Text style={[s.runIn, s.muted]}>(signed with override: {o.reason.replace(/_/g, " ")})</Text></Text>
              </View>
            ))}
            {context.deferred.map((d) => (
              <View key={d} style={s.item}>
                <Text style={s.mark}>•</Text>
                <Text style={{ flex: 1 }}>{d} <Text style={[s.runIn, s.muted]}>(deferred to the next visit)</Text></Text>
              </View>
            ))}
          </Section>
        )}

        {report.additionalNotes.trim() && (
          <Section title="Additional Notes" keep={false}>
            {lines(report.additionalNotes).map((p, i) => <Paragraph key={i} text={p} />)}
          </Section>
        )}

        <View style={s.signBlock} wrap={false}>
          <View>
            <View style={s.signLine} />
            <Text style={{ fontWeight: "bold" }}>{context.doctorName}{context.doctorSpecialty ? `, ${context.doctorSpecialty}` : ""}</Text>
            <Text style={s.muted}>Electronically signed {visit.signedAt}</Text>
          </View>
          <Text style={s.provenance}>
            {visit.editedAt
              ? `Built from the clinician-reviewed note and edited by the clinician on ${visit.editedAt}.`
              : "Built from the clinician-reviewed note. Each statement in the history, findings, assessment and plan traces to the visit transcript."}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
