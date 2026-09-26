import "./load-env";
import { Pool } from "pg";

// Usage: tsx scripts/db-report.ts — read-only summary of what's stored (row counts, hypertables, latest activity).
async function main() {
  const { pgConnection, usingPglite } = await import("@/lib/db");
  if (usingPglite()) {
    console.log("DATABASE_URL is empty: the app is using the local PGlite database, not Tiger.");
    process.exit(0);
  }
  const pool = new Pool(pgConnection(process.env.DATABASE_URL!));
  const q = async (text: string) => (await pool.query(text)).rows;

  const hyper = await q("select hypertable_name, num_chunks from timescaledb_information.hypertables order by 1");
  console.log("hypertables:", hyper.map((h) => `${h.hypertable_name} (${h.num_chunks} chunks)`).join(", ") || "none");
  for (const t of ["doctors", "patients", "visits", "open_items", "vitals", "events"]) {
    const [{ n }] = await q(`select count(*)::int as n from ${t}`);
    console.log(`${t.padEnd(10)} ${n}`);
  }
  const visits = await q(`select v.status, v.visit_type, p.first_name, v.started_at from visits v join patients p on p.id = v.patient_id
    order by v.started_at desc nulls last limit 5`);
  console.log("latest visits:", visits.map((v) => `${v.first_name} ${v.visit_type} ${v.status}`).join(" | "));
  const events = await q("select type, count(*)::int as n from events group by type order by min(time)");
  console.log("events:", events.map((e) => `${e.type}×${e.n}`).join(", ") || "none");
  const rosa = await q(`select known_medications from patients where first_name = 'Rosa'`);
  console.log("Rosa meds:", JSON.stringify(rosa[0]?.known_medications));
  const bp = await q(`select to_char(v.time, 'YYYY-MM-DD') as d, systolic, diastolic from vitals v join patients p on p.id = v.patient_id
    where p.first_name = 'Rosa' order by time`);
  console.log("Rosa BP:", bp.map((r) => `${r.d} ${r.systolic}/${r.diastolic}`).join(" -> "));
  if (process.argv.includes("--latest")) await latestVisit(q);
  await pool.end();
}

type Query = (text: string) => Promise<Record<string, any>[]>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** `--latest`: everything stored for the most recently started visit. */
async function latestVisit(q: Query) {
  const [v] = await q(`select v.*, p.first_name, p.last_name, p.known_medications from visits v join patients p on p.id = v.patient_id
    where v.utterances is not null order by v.started_at desc nulls last limit 1`);
  if (!v) return console.log("\nNo recorded visits yet.");
  console.log(`\n=== Latest visit: ${v.first_name} ${v.last_name} · ${v.visit_type} · ${v.status} · ${v.id}`);
  console.log(`started ${v.started_at?.toISOString()} · signed ${v.signed_at?.toISOString() ?? "-"} · sent ${v.sent_at?.toISOString() ?? "-"}`);
  console.log(`transcript: ${v.utterances.length} utterances · offline steps: ${JSON.stringify(v.metrics?.offlineSteps ?? [])} · processing ${v.metrics?.secondsProcessing}s`);
  for (const u of v.utterances) console.log(`  ${u.id} [${u.role}] ${u.text}`);
  console.log(`\nnote (${v.note.chiefComplaint}):`);
  for (const p of v.note.problems) {
    console.log(`  ## ${p.title}`);
    for (const s of v.note.sentences.filter((x: { problemId: string }) => x.problemId === p.id)) {
      console.log(`    ${s.section} ${s.review === "deleted" ? "[deleted] " : ""}${s.text}${s.origin === "clinician" ? " (clinician)" : ""}${s.review === "edited" ? " (edited)" : ""}`);
    }
  }
  console.log("\ngaps resolved:", (v.gaps ?? []).filter((g: { resolution: unknown }) => g.resolution).map((g: { label: string; resolution: { type: string } }) => `${g.label} → ${g.resolution.type}`).join("; ") || "none");
  console.log("sign-off overrides:", (v.signoff_overrides ?? []).map((o: { label: string; reason: string }) => `${o.label} (${o.reason})`).join("; ") || "none");
  const ft = v.followthrough;
  if (ft) {
    console.log("\ntasks:", ft.tasks.map((t: { category: string; description: string }) => `[${t.category}] ${t.description}`).join(" | "));
    console.log("summaries:", Object.keys(ft.summaries).join(", "), "· approved language:", ft.approvedLanguage ?? "-");
    console.log("medications before → after:", JSON.stringify(ft.previousMedications), "→", JSON.stringify(ft.currentMedications));
  }
  console.log("patient meds now:", JSON.stringify(v.known_medications));
  const items = await q(`select category, text, status from open_items where source_visit_id = '${v.id}'`);
  console.log("open items created:", items.map((i) => `[${i.category}] ${i.text} (${i.status})`).join(" | ") || "none");
  const vit = await q(`select systolic, diastolic, heart_rate, temp_f, spo2, weight_lb from vitals where visit_id = '${v.id}'`);
  console.log("vitals saved:", JSON.stringify(vit));
  const ev = await q(`select to_char(time, 'HH24:MI:SS') as t, type from events where visit_id = '${v.id}' order by time`);
  console.log("audit trail:", ev.map((e) => `${e.t} ${e.type}`).join(" → "));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
