import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Usage: tsx scripts/migrate.ts [--reset]
// Migrations and hypertables are applied by getDb(); --reset wipes everything first.
async function main() {
  if (process.argv.includes("--reset")) {
    if (!process.env.DATABASE_URL) {
      fs.rmSync(path.join(process.cwd(), "data", "pglite"), { recursive: true, force: true });
      console.log("[migrate] removed embedded PGlite database");
    } else {
      const { pgConnection } = await import("@/lib/db");
      const pool = new Pool(pgConnection(process.env.DATABASE_URL));
      await pool.query(
        "drop table if exists events, vitals, open_items, visits, patients, doctors cascade; drop schema if exists drizzle cascade;",
      );
      await pool.end();
      console.log("[migrate] dropped all tables");
    }
  }
  // Import after the reset so getDb() starts from a clean slate. getDb() seeds an empty DB.
  const { getDb } = await import("@/lib/db");
  await getDb();
  console.log("[migrate] schema up to date");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
