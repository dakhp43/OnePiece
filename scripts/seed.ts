import "./load-env";
import { sql } from "drizzle-orm";

// Usage: tsx scripts/seed.ts — wipes all rows and re-seeds the synthetic demo data.
async function main() {
  const { getDb } = await import("@/lib/db");
  const { seedDatabase } = await import("@/lib/db/seed");
  const db = await getDb();
  await db.execute(sql`truncate events, vitals, open_items, visits, patients, doctors cascade`);
  await seedDatabase(db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
