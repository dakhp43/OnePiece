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
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
