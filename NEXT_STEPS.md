# NEXT_STEPS.md: Carryover, phases 10–15

> **Audience:** the coding agent and the team, continuing from BUILD_PLAN.md (phases 0–8 are done and committed locally).
> Build **one phase at a time, in order**. Don't start a phase until the previous phase's acceptance checks pass.
> Each phase lists what the team provides, what gets built, known risks, acceptance checks, and API cost.

---

## Context

The core loop works live on the free tiers: record → Scribe v2 Medical → Gemini draft → Gemini audit → confidence scores and gaps → review → sign → tasks + EN/ES summary → chart updates (medications, BP). It was verified with 3 live runs; the last run used no offline fallback and took 27 s.

Four parts of BUILD_PLAN are built but have never touched their real services:

| Integration | Today | Blocks |
|---|---|---|
| Tiger Cloud | Local embedded PGlite (`data/pglite`) | MLH Tiger Data track; one shared database for the team |
| Real conversation through the mic | Only synthesized demo audio tested | Trust in the live demo; a real fallback recording |
| Gmail SMTP | Never sent | Phase 6 acceptance ("email with PDF arrives") |
| Backboard | Disabled; brief falls back to Gemini/chart | MLH Backboard track; pre-visit brief |

**Order and why:**
1. **Health check first,** so every later phase can be checked with one request.
2. **Tiger next,** because every later phase writes to the database and switching later would mean re-testing everything.
3. **The real conversation,** which also produces the fallback recording.
4. **Email,** which completes the doctor-to-patient loop.
5. **Backboard,** which reads signed visits from the database.
6. **Demo polish.**

### Decisions already made (from Q&A, don't reopen)
- **Database:** Tiger only, no automatic local fallback. Mitigate Wi-Fi risk with a phone hotspot plus a pre-demo health check.
- **Conversation language:** English. Transcription stays `languageCode: "eng"`. Spanish appears only in the written summary.
- **Backboard brief:** Backboard chat with read-only memory, on the cheapest chat model Backboard offers, cached 12 hours.
- **Reset demo:** Rosa only. It also deletes her Backboard assistant, which is rebuilt the next time her page opens.
- **Problem badge:** can't be "High" while any of its sentences is flagged and unreviewed.
- **Audit trail:** shown on the signed note page only.
- **Email:** sent from the product's dedicated Gmail to the user's own inbox. The send dialog still lets you change the address.
- **Pushing to GitHub:** nothing is pushed until the user says so.

### Hard rules (carried over from BUILD_PLAN)
- Keys live only in `.env.local`. Before every commit, `git grep --cached` for key prefixes (`sk_`, `AQ.`, the Backboard key prefix, the Tiger password) must come back empty.
- Before every commit: `npm run lint`, `npm run typecheck`, and `npm test` all pass.
- Commit after each phase. No push.
- **Every external call counts against a daily cap in `lib/usage.ts`,** so nothing can quietly run up usage.
- **Keep live test calls to the minimum each phase specifies.** Record the counters in `data/usage/` after each phase.

---

## Phase 10: Health check and pre-demo checklist

**Goal:** one request answers "is everything ready?" before any test or demo. It makes no billable calls.

**Build**
- `lib/health.ts` exports `checkHealth()`, which returns this shape:
  ```ts
  {
    db: { ok, driver: "tiger" | "pglite", latencyMs, hypertables: string[], error? },
    elevenlabs: { configured, ok, tier, creditsUsed, creditLimit, error? },
    gemini: { configured, ok, model, fallbackModel, error? },
    backboard: { enabled, configured, ok, balanceUsd, autoReload, error? },
    email: { provider, configured },   // checks config only; never sends
    usage: { today: readUsage(), limits },
    demoFallback: boolean
  }
  ```
- **Checks it runs, and what they cost:**
  - Database: `select 1` plus a hypertable query.
  - ElevenLabs: `GET /v1/user/subscription` (free).
  - Gemini: `GET /v1beta/models/{model}` (metadata only, free).
  - Backboard: `GET /billing/balance` (free).
  - The Gemini and Backboard checks don't go through `reserveGeminiCall`, since they generate nothing.
- `app/api/health/route.ts` requires a signed-in doctor. Results are cached for 30 seconds so page refreshes don't repeat the checks.
- `app/app/status/page.tsx` shows each check as a green or red row. Link it from the app header as a small "Status" link.

**Acceptance**
- With the current `.env.local`: database ok (PGlite, no hypertables), ElevenLabs ok (free tier, credits shown), Gemini ok, Backboard "disabled", email "not configured".
- The page loads in under 3 s, and `data/usage` counters don't change.

**Cost:** 0 credits, 0 Gemini generations.

---

## Phase 11: Move to Tiger Cloud

**You provide**
1. At console.cloud.timescale.com: create a **free** service (Postgres with TimescaleDB, region us-east-1). The password is shown once; save it in the team password store.
2. Copy the **service URL** (connection string) into `.env.local`: `DATABASE_URL=postgres://tsdbadmin:<pw>@<host>:<port>/tsdb?sslmode=require`

**Build**
- In `lib/db/index.ts`, `createDb()` should:
  - Rewrite `sslmode=require` to `sslmode=verify-full`. Our `pg` 8.23 already treats `require` as `verify-full` but prints a SECURITY WARNING on every start; Tiger's certificates are publicly trusted, so verification passes.
  - Set `Pool({ max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 })`. The free plan has no connection pooler, so connections must stay few.
  - Add `pool.on("error", …)` logging, so a dropped idle connection can't crash the dev server.
- Tiger's default user owns the `tsdb` database and TimescaleDB is already installed. So `ensureHypertables()` should find `timescaledb` in `pg_available_extensions`, and `create extension if not exists` should do nothing.
  - If `create_hypertable` fails with a permissions error, log it and continue. The existing try/catch already does this; add the specific message to the warning.
- `scripts/migrate.ts --reset` on Tiger drops the 6 tables plus the `drizzle` schema, as it does now. Test it once.
- The health page (Phase 10) shows `driver: "tiger"` and `hypertables: ["events", "vitals"]`.
- README "Setup": document Tiger as the primary database and PGlite as the no-config option for teammates without `DATABASE_URL`.

**Risks and mitigations**

| Risk | Mitigation |
|---|---|
| Wi-Fi drops mid-demo, so pages fail | Phone hotspot ready. Open the Status page before going on stage. The existing error page shows "Try again". |
| Tiger's free tier could pause when idle (the docs don't say) | Open the Status page 5 minutes before the demo; it wakes the service and shows latency. |
| Seeding over the network is slow (~40 inserts one at a time) | Only happens once. Acceptable. Measure it; if over 15 s, batch the inserts in `seed.ts`. |
| Two dev servers (teammates) share one database | That's the point of Tiger. `db:reset` wipes it for everyone, so say so in the team chat before running it. |

**Acceptance**
- `npm run db:reset` then `npm run dev`: the patient list loads from Tiger. Rosa has 2 open items and 2 BP points.
- Status page: database ok, driver tiger, both tables are hypertables, latency under 300 ms.
- Run one visit with **Load demo visit** and sign it. The BP chart shows 3 points. The row counts in `events` and `vitals` go up; I check them in the Tiger console SQL editor.
- Dr. Nguyen still gets 403 on Rosa's page.

**Cost:** 1 demo visit, about 77 s of audio (~85 credits) and about 4 Gemini calls.

---

## Phase 12: Real conversation test, then save it as the demo recording

**You provide**
- Two teammates perform the BUILD_PLAN §15 script, in English, into the laptop mic on the record page. Ideally do one take in a quiet room and one in the noisy venue.
- For each take, go through review, sign, and follow-through yourselves. Note anything wrong: speakers mixed up, missed words, bad sentences, missing gaps, wrong tasks.
- Tell me which visit is the best take (the URL contains its id).

**Build / fix loop (I do this while you test)**
- Watch the server log and `data/usage/`. For each problem you report, find the cause:
  - Speakers mixed up: check the diarization output. The fix may be the `numSpeakers` setting, or letting Call A's role mapping decide who is who.
  - Utterance splits look wrong: tune the 1.2 s pause threshold in `lib/stt/utterances.ts`, with a unit test that uses the real transcript.
  - A number is flagged when it shouldn't be: add the case to `lib/scoring/numbers.ts` and its tests.
  - Weak note sentences: adjust the Call A prompt in `lib/llm/prompts/draftNote.ts`. Only for real failures, not style.
- Change the recorder to pick `audio/webm;codecs=opus` explicitly if Chrome defaults to something else. `pickMimeType` in `Recorder.tsx` already does this; confirm it.
- **Promote the best take:** `npm run fixtures:promote <visitId>` copies the recording to `data/fixtures/demo/demo.webm` along with its transcript, utterances, note, audit, follow-through, and Spanish summary. Once `demo.webm` exists, `DEMO_AUDIO` in `lib/fixtures.ts` uses it instead of the synthesized `demo.wav`.
- Update the fixture test in `lib/stt/utterances.test.ts` (it asserts "maybe 40" comes from `speaker_1`) so it matches the new transcript.

**Acceptance**
- With a real mic take:
  - Two speakers, with clinician and patient roles correct.
  - The uncertain dose is flagged (amber or red, "Speaker sounded unsure").
  - "Allergies reviewed" and "Follow up: Review basic metabolic panel…" are missing.
  - Processing takes under 45 s.
- "Load demo visit" now plays the real recording, and clicking a sentence seeks to the right spot in it.
- `npm test` passes.

**Cost:** about 100 credits and about 6 Gemini calls per take. Budget: at most 4 takes (~400 credits).

---

## Phase 13: Email

**You provide** (in `.env.local`)
```
EMAIL_PROVIDER=gmail
GMAIL_USER=<product gmail address>
GMAIL_APP_PASSWORD=<16-char app password; needs 2-Step Verification on that account>
EMAIL_FROM=Carryover Demo Clinic <product gmail address>
DEMO_PATIENT_EMAIL=<your personal inbox>
```

**Build**
- **Rosa's email:** the seed reads `DEMO_PATIENT_EMAIL` only when seeding. After setting it, run `npm run db:seed` (Rosa only is enough once Phase 15's reset exists). The send dialog prefills it.
- **Clearer errors in `lib/email/send.ts`:**
  - Missing configuration: throw `ApiError(503, "Email isn't configured: set GMAIL_USER and GMAIL_APP_PASSWORD")` instead of a raw 500.
  - Gmail rejecting the login (error code `EAUTH`): 502 with "Gmail rejected the app password".
- **Offline behavior:** there's no fixture fallback for email. The Send button shows the error, the visit stays `signed`, and you can retry.
- **Phone display:** check that the PDF's filename (`visit-summary.pdf` / `resumen-de-visita.pdf`) and the plain-text body look right on a phone.

**Acceptance**
- Status page: email configured.
- For Rosa (Spanish): check "I reviewed the Spanish summary", then Approve & send (ES). Within 1 minute your inbox gets "Resumen de su visita del …" with the Spanish PDF attached, from the product Gmail.
- The visit's status becomes `sent` and the follow-through header shows "Sent <date>". An `email_sent` row exists in `events`.
- Before the review box is checked, Send ES is disabled and the API returns 409.

**Cost:** free (Gmail allows about 500 emails a day). Budget: 3 test emails.

---

## Phase 14: Backboard patient memory and brief

**You provide:** `BACKBOARD_API_KEY=` and `BACKBOARD_ENABLED=true` in `.env.local`. In the Backboard dashboard, **make sure auto-reload / auto top-up is off**, so the $5 free credit (valid 30 days, no card) can't turn into charges.

**Build**
- **Pick the model before writing code.** One free `GET /models?model_type=llm` call; pick the cheapest chat model by `input_cost_per_1m_tokens` + `output_cost_per_1m_tokens`. Prefer a Google Flash-Lite model if it's close in price. Put it in `.env.local` as `BACKBOARD_LLM_PROVIDER` / `BACKBOARD_MODEL`, and send them as `llm_provider` / `model_name` in `backboardBrief()` (`lib/memory/backboard.ts`).
- **Spending guard, in `lib/usage.ts`:**
  - Add a `backboardCalls` counter and `reserveBackboardCall()` (default `BACKBOARD_DAILY_CALL_LIMIT=60`), called inside `bb()` before every request.
  - Before the first Backboard call of the day, check the balance: `GET /billing/balance` (free, cached 10 minutes). If `balance_usd < 0.50` or auto-reload is on, refuse the call (log "Backboard credit low / auto-reload on"), and the brief falls back to Gemini/chart as it does today.
- **Order of writes.** `ensureAssistant()` loads memories from all signed visits when it first creates a patient's assistant; `rememberSignedVisit()` adds one per new signed visit. Confirm the add-memory call returns 201. If memory writes turn out to be asynchronous, the brief right after signing may not include the new visit yet; if so, show a note under the brief ("Memory updates in about a minute").
- **Brief prompt** (`BRIEF_QUESTION`): keep it. Pass `memory: "Readonly"` so the brief request itself creates no new memories.
- **Source badge:** the brief card already shows "Memory: Backboard". Also check that the chart context we send doesn't stop the model from citing memory (compare one brief with the chart context and one without; keep whichever mentions past visits correctly).

**Acceptance**
- Status page: Backboard ok, balance shown, auto-reload off.
- Open Rosa's page for the first time: the brief card shows "Memory: Backboard" and mentions (a) the lisinopril increase to 20 mg, (b) the pending metabolic panel / home BP log, (c) the BP trend 156/96 → 146/90.
- Sign one demo visit (lisinopril → losartan), then reopen Rosa. The cache is invalidated because the latest signed visit changed. The new brief mentions losartan and the cough.
- With `BACKBOARD_ENABLED=false`, the brief still appears and says "Generated from chart".
- The Backboard balance drops by less than $0.10 across all of this.

**Cost:** about 3 memory writes plus 2–3 brief calls, well under $0.10.

---

## Phase 15: Demo polish

### 15.1 Reset demo (Rosa only)
- `POST /api/demo/reset` requires a signed-in doctor and only works when `DEMO_FALLBACK=true`. It returns 403 otherwise.
- In one transaction:
  1. Find Rosa as the seeded patient with email = `DEMO_PATIENT_EMAIL` or name Rosa Martinez, belonging to the signed-in doctor.
  2. Delete her visits other than the 2 seeded ones. Seeded visits are marked by a new `seeded boolean not null default false` column on `visits`, set to true in `seed.ts` (new migration `0001_*.sql` via `npm run db:generate`).
  3. Delete `vitals` and `events` rows for the deleted visits. Delete `open_items` created by those visits. Reopen the 2 seeded open items (`status = open`, `closed_visit_id = null`).
  4. Restore `known_medications` to lisinopril 20 mg daily (from `rosa()` in `seed.ts`; export the seed constants so they aren't duplicated).
  5. Remove audio files for deleted visits from `data/audio/`.
- Outside the transaction: if `backboard_assistant_id` is set, call `DELETE /assistants/{id}` (docs say this deletes its threads, and in practice memories). Then set the column to null. The next brief rebuilds it with only the 2 seeded visits. Clear the brief cache entry.
- **UI:** a small "Reset demo patient" button on the Status page (Phase 10), with a confirmation dialog. It's not on Rosa's page, so it can't be clicked by accident on stage.
- **Acceptance:** after one full demo visit plus a reset, Rosa's page matches a fresh seed: 2 visits, 2 open items, 2 BP points, lisinopril 20 mg, a fresh Backboard brief. Other patients are unchanged.

### 15.2 Problem badge rule
- In `lib/scoring/confidence.ts`, `scoreNote()`: keep the score, but if any live sentence is `review === "unreviewed"` and scored below `FLAG_THRESHOLD`, cap the level at `"medium"`. `levelFor` is unchanged; the cap is applied after it.
- **Unit tests:** (a) a problem at 0.86 with one unreviewed flagged sentence shows "medium"; (b) after that sentence is accepted, it shows "high".
- **Acceptance:** in review, the Hypertension badge is amber until the dose sentence is accepted or edited, then turns green.

### 15.3 Audit trail on the signed note page
- `lib/queries.ts` gets `getVisitEvents(visitId)`: `events` ordered by `time`, at most 200.
- `app/app/visits/[visitId]/note/page.tsx` gets an "Audit trail" card: a timeline with the time (hh:mm:ss), a readable label per event type, and a short detail from the payload.
  - Example: `sentence_edited` shows before → after.
  - Example: `signoff_override` shows the item and reason.
  - Example: `medications_updated` shows before → after.
  - Label: "Stored in a TimescaleDB hypertable" when the driver is Tiger.
- **Acceptance:** after a demo visit, the timeline shows in order: recording started/ended → note drafted → edits → gap actions → override → signed → medications updated → email sent.

### 15.4 Browser regression pass
- Extend the headless-browser walkthrough (scratchpad `pw/e2e.mjs`): Status page → reset → full demo using Load demo visit → audit trail screenshot.
- Run it after each of 15.1–15.3. Look at every screenshot at 1440×900.

**Cost for Phase 15:** about 2 demo visits (~170 credits, ~8 Gemini calls) and 1 Backboard assistant rebuild.

---

## Verification after all phases
1. `npm run lint && npm run typecheck && npm test && npm run build` all pass.
2. Status page all green: Tiger, ElevenLabs, Gemini, Backboard (balance ok, auto-reload off), email.
3. A full run of the BUILD_PLAN §15 script, live mic, under 4 minutes: brief (Backboard) → record → review (dose flagged, allergy and lab gaps) → sign with override → follow-through → Spanish email arrives in your inbox → audit trail visible.
4. Wi-Fi off → "Load demo visit" still processes (AI steps offline). Pages still need Tiger, so the hotspot is the fallback for the database, as agreed.
5. Reset demo → Rosa is back to her seeded state.
6. `data/usage/` for the day stays under the caps. ElevenLabs credits used (Status page) stay under 1,500 across phases 10–15.

## What you need to do, in order
| When | Action |
|---|---|
| Before Phase 11 | Create the free Tiger Cloud service and put the service URL in `.env.local` as `DATABASE_URL` |
| During Phase 12 | Two teammates record the script (a quiet take and a noisy take); report issues; pick the best visit |
| Before Phase 13 | Product Gmail: turn on 2-Step Verification, create an app password, add the 5 email vars (sender = product Gmail, `DEMO_PATIENT_EMAIL` = your inbox) |
| Before Phase 14 | Backboard key in `.env.local`; confirm auto-reload is off in the Backboard dashboard |
| Before the demo | Have a phone hotspot ready; open the Status page 5 minutes before going on stage |
| When ready | Tell me to push; make the GitHub repo public |
