import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PatientSummary } from "@/lib/contracts";

const COPY = {
  en: {
    clinic: "Carryover Demo Clinic",
    title: "Your visit summary",
    visit: "Visit date", doctor: "Your doctor",
    discussed: "What we talked about",
    medicines: "Your medicines",
    next: "What to do next",
    help: "When to get help",
    helpNone: "Call the clinic if you have questions or feel worse.",
    followUp: "Your next visit",
    badge: { new: "New", changed: "Changed", stopped: "Stopped", continue: "Continue" },
    noMedChanges: "No changes to your medicines.",
    disclaimer: "Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.",
  },
  es: {
    clinic: "Carryover Demo Clinic",
    title: "Resumen de su visita",
    visit: "Fecha de la visita", doctor: "Su médico",
    discussed: "De qué hablamos",
    medicines: "Sus medicinas",
    next: "Qué hacer ahora",
    help: "Cuándo pedir ayuda",
    helpNone: "Llame a la clínica si tiene preguntas o se siente peor.",
    followUp: "Su próxima visita",
    badge: { new: "Nueva", changed: "Cambió", stopped: "Suspendida", continue: "Continuar" },
    noMedChanges: "No hay cambios en sus medicinas.",
    disclaimer: "Prototipo para hackUMBC 2026. No es para uso clínico. Solo datos sintéticos.",
  },
} as const;

const BADGE_COLORS = {
  new: { bg: "#ccfbf1", fg: "#115e59" },
  changed: { bg: "#fef3c7", fg: "#92400e" },
  stopped: { bg: "#fee2e2", fg: "#991b1b" },
  continue: { bg: "#e2e8f0", fg: "#334155" },
} as const;

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 48, fontSize: 13, lineHeight: 1.5, color: "#0f172a", fontFamily: "Helvetica" },
  header: { borderBottomWidth: 2, borderBottomColor: "#0d9488", paddingBottom: 10, marginBottom: 18 },
  clinic: { fontSize: 11, color: "#0f766e", fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 4, lineHeight: 1.2 },
  meta: { fontSize: 11, color: "#475569", marginTop: 8 },
  greeting: { fontSize: 14, marginBottom: 14 },
  section: { marginBottom: 16 },
  h2: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0f766e", marginBottom: 6 },
  topic: { fontFamily: "Helvetica-Bold" },
  item: { marginBottom: 6 },
  medRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  badge: { fontSize: 10, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, marginRight: 8, marginTop: 2 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  box: { width: 11, height: 11, borderWidth: 1.2, borderColor: "#334155", marginRight: 8, marginTop: 4 },
  when: { color: "#475569" },
  followUp: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 9, color: "#64748b", textAlign: "center", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

export interface SummaryDocumentProps {
  summary: PatientSummary;
  firstName: string;
  visitDate: string;
  doctorName: string;
}

export function SummaryDocument({ summary, firstName, visitDate, doctorName }: SummaryDocumentProps) {
  const t = COPY[summary.language];
  return (
    <Document title={`${t.title} - ${firstName}`} author="Carryover Demo Clinic">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.clinic}>{t.clinic.toUpperCase()}</Text>
          <Text style={s.title}>{t.title}</Text>
          <Text style={s.meta}>{firstName} · {t.visit}: {visitDate} · {t.doctor}: {doctorName}</Text>
        </View>

        <Text style={s.greeting}>{summary.greeting}</Text>

        <View style={s.section}>
          <Text style={s.h2}>{t.discussed}</Text>
          {summary.whatWeDiscussed.map((d, i) => (
            <Text key={i} style={s.item}><Text style={s.topic}>{d.topic}. </Text>{d.explanation}</Text>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>{t.medicines}</Text>
          {summary.medicationChanges.length === 0 && <Text>{t.noMedChanges}</Text>}
          {summary.medicationChanges.map((m, i) => (
            <View key={i} style={s.medRow} wrap={false}>
              <Text style={[s.badge, { backgroundColor: BADGE_COLORS[m.change].bg, color: BADGE_COLORS[m.change].fg }]}>
                {t.badge[m.change]}
              </Text>
              <Text style={{ flex: 1 }}><Text style={s.topic}>{m.name}: </Text>{m.instructions}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>{t.next}</Text>
          {summary.nextSteps.map((n, i) => (
            <View key={i} style={s.checkRow} wrap={false}>
              <View style={s.box} />
              <Text style={{ flex: 1 }}>{n.text}{n.when ? <Text style={s.when}> ({n.when})</Text> : null}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>{t.help}</Text>
          {summary.whenToGetHelp.length === 0
            ? <Text>{t.helpNone}</Text>
            : summary.whenToGetHelp.map((h, i) => <Text key={i} style={s.item}>• {h}</Text>)}
        </View>

        {summary.followUp && (
          <View style={s.section}>
            <Text style={s.h2}>{t.followUp}</Text>
            <Text style={s.followUp}>{summary.followUp}</Text>
          </View>
        )}

        <Text style={s.footer} fixed>{t.disclaimer}</Text>
      </Page>
    </Document>
  );
}
