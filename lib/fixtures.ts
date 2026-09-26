import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";

export const FIXTURES_DIR = path.join(process.cwd(), "data", "fixtures");
export const DEMO_DIR = path.join(FIXTURES_DIR, "demo");
export const LAST_GOOD_DIR = path.join(FIXTURES_DIR, "last_good");

/** Prefer a real recorded demo.webm once the team commits one; fall back to the synthesized demo.wav. */
export const DEMO_AUDIO = fs.existsSync(path.join(DEMO_DIR, "demo.webm"))
  ? path.join(DEMO_DIR, "demo.webm")
  : path.join(DEMO_DIR, "demo.wav");

export type FixtureStep =
  | "transcript" | "utterances" | "note" | "audit" | "followthrough" | "summary_es" | "brief";

export function demoFallbackEnabled() {
  return process.env.DEMO_FALLBACK !== "false";
}

/** After every successful pipeline step, keep its output so a good run can be promoted to a demo fixture. */
export function saveLastGood(step: FixtureStep, data: unknown) {
  try {
    fs.mkdirSync(LAST_GOOD_DIR, { recursive: true });
    fs.writeFileSync(path.join(LAST_GOOD_DIR, `${step}.json`), JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("[fixtures] could not save last_good", step, (err as Error).message);
  }
}

/** Loads and validates a committed demo fixture, or null if missing/invalid. */
export function loadDemoFixture<T>(step: FixtureStep, schema: ZodType<T>): T | null {
  const file = path.join(DEMO_DIR, `${step}.json`);
  if (!fs.existsSync(file)) return null;
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    console.warn(`[fixtures] demo/${step}.json failed validation`, parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
}
