import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Report } from "@/lib/contracts";
import type { ReportContext } from "@/lib/report-context";

const INK = "#0f172a";
const MUTED = "#475569";
const RULE = "#cbd5e1";
const ACCENT = "#0f766e";

const CHANGE = {
  new: { label: "New", bg: "#ccfbf1", fg: "#115e59" },
  changed: { label: "Changed", bg: "#fef3c7", fg: "#92400e" },
  stopped: { label: "Stopped", bg: "#fee2e2", fg: "#991b1b" },
  continue: { label: "Continue", bg: "#e2e8f0", fg: "#334155" },
} as const;

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10.5, lineHeight: 1.45, color: INK, fontFamily: "Helvetica" },
  letterhead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.5, borderBottomColor: ACCENT, paddingBottom: 8 },
  clinic: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ACCENT, letterSpacing: 1 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  status: { fontSize: 9, color: MUTED, textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, borderWidth: 0.75, borderColor: RULE, borderRadius: 3 },
  cell: { width: "33.33%", paddingVertical: 5, paddingHorizontal: 7, borderColor: RULE },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  value: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },
  section: { marginTop: 14 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, borderBottomWidth: 0.75, borderBottomColor: RULE, paddingBottom: 2, marginBottom: 5 },
  para: { marginBottom: 5 },
  muted: { color: MUTED },
  vitalsRow: { flexDirection: "row", borderWidth: 0.75, borderColor: RULE, borderRadius: 3 },
  vital: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 0.75, borderRightColor: RULE },
  table: { borderWidth: 0.75, borderColor: RULE, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 3.5, paddingHorizontal: 6, alignItems: "center" },
  th: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  badge: { fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, alignSelf: "flex-start" },
  problem: { marginBottom: 8 },
  problemTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  dot: { width: 10 },
  allergy: { color: "#991b1b", fontFamily: "Helvetica-Bold" },
  signature: { marginTop: 18, borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footer: { position: "absolute", bottom: 22, left: 44, right: 44, fontSize: 8, color: "#64748b", textAlign: "center", borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 5 },
});

export interface ReportDocumentProps {
  report: Report;
  context: ReportContext;
  patient: { name: string; dob: string; ageSex: string };
  visit: { date: string; type: string; signedAt: string; status: string; editedAt: string | null };
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

export function ReportDocument({ report, context, patient, visit }: ReportDocumentProps) {
  const v = context.vitals;
  const vitals = v
    ? [
        ["Blood pressure", v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic} mmHg` : "—"],
        ["Heart rate", v.heartRate ? `${v.heartRate} bpm` : "—"],
        ["Temperature", v.tempF ? `${v.tempF} °F` : "—"],
        ["SpO2", v.spo2 ? `${v.spo2}%` : "—"],
        ["Weight", v.weightLb ? `${v.weightLb} lb` : "—"],
      ]
    : null;

  return (
    <Document title={`Clinical visit report - ${patient.name}`} author="Carryover Demo Clinic">
      <Page size="LETTER" style={s.page}>
        <View style={s.letterhead}>
          <View>
            <Text style={s.clinic}>CARRYOVER DEMO CLINIC</Text>
            <Text style={s.title}>Clinical visit report</Text>
          </View>
          <Text style={s.status}>{visit.status}{"\n"}{report.editedAt ? "Edited by clinician after signing" : "Generated from the signed note"}</Text>
        </View>

        <View style={s.grid}>
          {[
            ["Patient", patient.name], ["Date of birth", patient.dob], ["Age / sex", patient.ageSex],
            ["Visit date", visit.date], ["Visit type", visit.type], ["Clinician", context.doctorName],
          ].map(([label, value], i) => (
            <View key={label} style={[s.cell, { borderRightWidth: i % 3 === 2 ? 0 : 0.75, borderBottomWidth: i < 3 ? 0.75 : 0 }]}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.value}>{value}</Text>
            </View>
          ))}
        </View>

        <Section title="Chief complaint">
          <Text>{report.chiefComplaint || "—"}</Text>
        </Section>

        <View style={s.section}>
          <Text style={s.h2} minPresenceAhead={60}>History of present illness</Text>
          {lines(report.hpi).map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}
        </View>

        <Section title="Vital signs">
          {vitals ? (
            <View style={s.vitalsRow}>
              {vitals.map(([label, value], i) => (
                <View key={label} style={[s.vital, i === vitals.length - 1 ? { borderRightWidth: 0 } : {}]}>
                  <Text style={s.label}>{label}</Text>
                  <Text style={s.value}>{value}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={s.muted}>No vital signs recorded for this visit.</Text>}
        </Section>

        {report.examination.trim() && (
          <Section title="Examination and findings">
            {lines(report.examination).map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}
          </Section>
        )}

        <Section title={context.medications.reconciled ? "Medications after this visit" : "Medications on file"}>
          {context.medications.list.length === 0 ? <Text style={s.muted}>None on file.</Text> : (
            <View style={s.table}>
              <View style={[s.tr, { backgroundColor: "#f1f5f9" }]}>
                <Text style={[s.th, { flex: 2 }]}>Medication</Text>
                <Text style={[s.th, { flex: 2 }]}>Dose and frequency</Text>
                {context.medications.reconciled && <Text style={[s.th, { flex: 1 }]}>Change</Text>}
              </View>
              {context.medications.list.map(({ med, change }, i) => (
                <View key={med.name + i} style={[s.tr, i === context.medications.list.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={{ flex: 2, fontFamily: "Helvetica-Bold", textDecoration: change === "stopped" ? "line-through" : "none", textTransform: "capitalize" }}>{med.name}</Text>
                  <Text style={{ flex: 2 }}>{`${med.dose} ${med.frequency}`.trim() || "—"}</Text>
                  {context.medications.reconciled && (
                    <View style={{ flex: 1 }}>
                      <Text style={[s.badge, { backgroundColor: CHANGE[change].bg, color: CHANGE[change].fg }]}>{CHANGE[change].label}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {!context.medications.reconciled && <Text style={[s.muted, { marginTop: 3, fontSize: 8.5 }]}>Current chart list; no medication reconciliation was recorded for this visit.</Text>}
        </Section>

        <Section title="Allergies">
          {context.allergies.length ? <Text style={s.allergy}>{context.allergies.join(", ")}</Text> : <Text>No known drug allergies.</Text>}
        </Section>

        <View style={s.section}>
          <Text style={s.h2} minPresenceAhead={90}>Assessment and plan</Text>
          {report.problems.map((p, i) => (
            <View key={p.problemId} style={s.problem} wrap={false}>
              <Text style={s.problemTitle}>{i + 1}. {p.title}</Text>
              {p.assessment.trim() && <Text style={s.para}><Text style={s.muted}>Assessment: </Text>{p.assessment}</Text>}
              {lines(p.plan).length > 0 && (
                <View>
                  <Text style={s.muted}>Plan:</Text>
                  {lines(p.plan).map((l, j) => (
                    <View key={j} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{l}</Text></View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {context.tasks && context.tasks.length > 0 && (
          <Section title="Orders and follow-up">
            {context.tasks.map((t) => (
              <View key={t.id} style={s.bullet}>
                <Text style={s.dot}>•</Text>
                <Text style={{ flex: 1 }}>{t.description}<Text style={s.muted}>{`  (${t.category}${t.dueInDays != null ? `, due in ${t.dueInDays} days` : ""})`}</Text></Text>
              </View>
            ))}
          </Section>
        )}

        {(context.overrides.length > 0 || context.deferred.length > 0) && (
          <Section title="Items not addressed at this visit">
            {context.overrides.map((o) => (
              <View key={o.itemId} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{o.label}<Text style={s.muted}>{`  (signed with override: ${o.reason.replace(/_/g, " ")})`}</Text></Text></View>
            ))}
            {context.deferred.map((d) => (
              <View key={d} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{d}<Text style={s.muted}>  (deferred to next visit)</Text></Text></View>
            ))}
          </Section>
        )}

        {report.additionalNotes.trim() && (
          <Section title="Additional notes">
            {lines(report.additionalNotes).map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}
          </Section>
        )}

        <View style={s.signature} wrap={false}>
          <View>
            <Text style={s.label}>Electronically signed</Text>
            <Text style={s.value}>{context.doctorName}</Text>
            <Text style={s.muted}>{visit.signedAt}</Text>
          </View>
          <Text style={[s.muted, { fontSize: 8.5, maxWidth: 260, textAlign: "right" }]}>
            {visit.editedAt
              ? `Built from the clinician-reviewed note and edited by the clinician on ${visit.editedAt}.`
              : "Built from the clinician-reviewed note; each line of the history, findings, assessment and plan traces to the visit transcript."}
          </Text>
        </View>

        <Text style={s.footer} fixed>Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.</Text>
      </Page>
    </Document>
  );
}
