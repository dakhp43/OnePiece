import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

export type DB = NodePgDatabase<typeof schema>;
export { schema };

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const PGLITE_DIR = path.join(process.cwd(), "data", "pglite");

const g = globalThis as unknown as { __carryoverDb?: Promise<DB> };

/**
 * Connection options with verified TLS. Tiger signs its certificates with its own CA ("ca.timescale.com"),
 * so we trust that CA (certs/tiger-ca.pem, public, committed) and still check the hostname. `sslmode` is
 * removed from the URL because pg lets URL settings override the explicit `ssl` option.
 * sslmode=disable keeps plain connections for a local Docker Postgres.
 */
export function pgConnection(url: string): { connectionString: string; ssl: false | { ca?: string; rejectUnauthorized: true } } {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  if (mode === "disable") return { connectionString: u.toString(), ssl: false };
  const caFile = process.env.DATABASE_CA_FILE
    || (u.hostname.endsWith(".tsdb.cloud.timescale.com") ? path.join(process.cwd(), "certs", "tiger-ca.pem") : null);
  const ca = caFile && fs.existsSync(/*turbopackIgnore: true*/ caFile) ? fs.readFileSync(caFile, "utf8") : undefined;
  return { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true } };
}

/** True when no DATABASE_URL is set and we run on the embedded PGlite database. */
export function usingPglite() {
  return !process.env.DATABASE_URL;
}

async function createDb(): Promise<DB> {
  let db: DB;
  if (usingPglite()) {
    const client = new PGlite(PGLITE_DIR);
    const pdb = drizzlePglite(client, { schema });
    await migratePglite(pdb, { migrationsFolder: MIGRATIONS });
    db = pdb as unknown as DB;
  } else {
    // Tiger's console URL omits the password; pg then reads PGPASSWORD. Fail with a clear message if neither has it.
    const hasUrlPassword = /^postgres(?:ql)?:\/\/[^:/@]+:[^@]+@/.test(process.env.DATABASE_URL!);
    if (!hasUrlPassword && !process.env.PGPASSWORD) {
      throw new Error("Database password missing: set PGPASSWORD in .env.local (Tiger's service URL doesn't include it)");
    }
    // Tiger's free plan has no connection pooler, so keep the pool small.
    const pool = new Pool({ ...pgConnection(process.env.DATABASE_URL!), max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
    db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
  }
  await ensureHypertables(db);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.doctors);
  if (count === 0) await seedDatabase(db);
  return db;
}

/** Lazily connects, migrates, and seeds (if empty). Shared across route modules in one process. */
export function getDb(): Promise<DB> {
  if (!g.__carryoverDb) {
    g.__carryoverDb = createDb().catch((err) => {
      g.__carryoverDb = undefined;
      throw err;
    });
  }
  return g.__carryoverDb;
}

/** Turn vitals and events into TimescaleDB hypertables. Skips (with a warning) when TimescaleDB isn't available. */
export async function ensureHypertables(db: DB) {
  try {
    const avail = await db.execute(sql`select 1 from pg_available_extensions where name = 'timescaledb'`);
    if (avail.rows.length === 0) {
      console.warn("[db] timescaledb extension not available; vitals/events stay plain tables");
      return;
    }
    await db.execute(sql`create extension if not exists timescaledb`);
    await db.execute(sql`select create_hypertable('vitals', 'time', if_not_exists => TRUE, migrate_data => TRUE)`);
    await db.execute(sql`select create_hypertable('events', 'time', if_not_exists => TRUE, migrate_data => TRUE)`);
  } catch (err) {
    // e.g. "permission denied" if the DB user can't create the extension; the app still works.
    console.warn("[db] could not create hypertables (vitals/events stay plain tables):", (err as Error).message);
  }
}
