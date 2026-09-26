import { getDb, schema } from "@/lib/db";
import type { EventType } from "@/lib/db/schema";

/** Appends to the audit trail (events hypertable). Never throws: logging must not break a request. */
export async function logEvent(
  type: EventType,
  { visitId, doctorId, payload }: { visitId?: string | null; doctorId?: string | null; payload?: Record<string, unknown> },
) {
  try {
    const db = await getDb();
    await db.insert(schema.events).values({ time: new Date(), type, visitId, doctorId, payload: payload ?? {} });
  } catch (err) {
    console.error("[events] failed to log", type, (err as Error).message);
  }
}
