# COPILOT_PLAN.md: Carryover Live Copilot, phases 16–22

> **Audience:** the coding agent and the team, continuing from NEXT_STEPS.md (phases 10–15).
> Build **one phase at a time, in order**. Each phase lists what you provide, what gets built, risks, acceptance checks and API cost.

---

## Context

Today Carryover finds missing information only **after** the visit: the batch pipeline (Scribe v2 Medical → Gemini draft → Gemini audit → gaps) flags items like "allergies not reviewed" on the review screen, when the patient has already left. The idea doc's thesis is: *"Current AI scribes document what was said. We identify what still needs to be said before the patient walks out the door."*

This feature adds a **Live Copilot** to the recording screen:
- It listens through a hidden live transcript (ElevenLabs Scribe v2 Realtime).
- About every 20 s it asks Gemini which checklist items are covered, missing or unknown so far.
- It occasionally shows a chime and a **"Consider asking: …"** card.
- When the conversation covers the item, the card turns **Captured ✓** and fades.

After the visit, the review screen shows which gaps were **caught live**, a new metric counts them, and every prompt goes into the audit trail.

**The after-visit pipeline stays unchanged and authoritative.** The copilot is an additive layer. If it fails in any way, recording, upload and processing behave exactly as they do today.

### Revision 2 (2026-09-27, after Phase 19): follow the conversation, not a checklist
The user tried the first version and it listed all ~22 checklist items. New direction (supersedes the checklist
parts of Phases 17–21 below):
- **Topics, not checklist.** Each check, Gemini lists the topics the conversation opened ("Dizziness on standing",
  "Switch to losartan") with what is known and what is still missing. Questions are written on the fly for a
  half-answered topic, typically a symptom mentioned in passing that the doctor moved on from.
- **Input is the conversation only**, plus the chart's medications and allergies. No visit-type checklist, no
  carried-over open items.
- **Screen:** only the half-answered topics (0–3 lines, e.g. "Cough: 3 weeks ✓ · fever ?") plus the one card.
- **After the visit:** audit trail only. The GapsPanel "Asked live" marks and the `gapsCaughtLive` metric are dropped.
- Gate rules unchanged in spirit: 30 s quiet start, one card, max 3, 45 s apart, confidence ≥ 0.8, a real
  question of 15 words or fewer, one prompt per topic, never repeated.
- Demo script now has a half-answered dizziness moment instead of the kidney-lab open item.
- Verified with `npm run copilot:probe`: dizziness prompt at 60 s → captured at 120 s; allergy prompt at 140 s
  → captured at 200 s.

### What exists and gets reused (verified in code)

| Need | Existing piece |
|---|---|
| Checklist per visit type | `lib/templates/{htn_followup,t2dm_followup,acute_respiratory}.json` via `getTemplate()`. Items have `id`, `label`, `priority`, `condition`. |
| Last visit's open items | `getOpenItems(patientId)` (`lib/queries.ts`), `buildChecklist(template, openItems)` (`lib/gaps.ts`), ids `open:<uuid>` |
| Checklist judging rules | `lib/llm/prompts/auditNote.ts` system prompt (condition → not_applicable; `open:` covered only if specifically addressed) |
| Chart context for prompts | `loadChartContext(patient)` + `chartContextText(patient, ctx)` (`lib/memory/chart.ts`) |
| Gemini JSON calls | `generateJson({schema, system, user, temperature, label})` (`lib/llm/gemini.ts`); `withTimeout` (`lib/http.ts`) |
| Realtime token | Installed `@elevenlabs/elevenlabs-js` 2.69.0 supports `client.tokens.singleUse.create("realtime_scribe")` (15-min token) |
| Route pattern | `route()`, `readJson`, `ApiError` (`lib/api.ts`), `requireDoctorApi()`, `loadVisit()`, `assertStatus`/`updateVisit` (`lib/visits.ts`), `logEvent()` (`lib/events.ts`); in-flight dedupe map in `app/api/visits/[visitId]/followthrough/route.ts` |
| Caps | `lib/usage.ts` (`LIMITS`, `reserve*`, `data/usage/YYYY-MM-DD.json`) |
| Mic stream | `Recorder.tsx` already taps the `getUserMedia` stream with an `AnalyserNode` for the waveform |
| Demo audio tooling | `scripts/make-demo-audio.ps1` (Windows SAPI, **16 kHz mono PCM**, which is exactly Realtime's `pcm_16000`) + `scripts/build-demo-fixture.ts` |

**Gaps found during research:**
- There is no audit-trail UI yet (NEXT_STEPS 15.3 was never built). Events are written but not shown, so Phase 21 builds a small one.
- `generateJson` has no retry-count option, so Phase 18 adds an optional `retries` argument (default behaviour unchanged).
- Realtime STT has **no speaker labels**. That's fine for coverage tracking, and the final transcript stays batch.

### Decisions made (from Q&A, don't reopen)
- **Timeline:** build the fuller version before the **10:00 AM freeze** (commit window ends 11:45 AM EDT). The phases are ordered so an early stop still demos. See the cut line.
- **Live audio:** ElevenLabs Scribe v2 Realtime, streamed from the browser with a server-minted single-use token. The API key never reaches the browser.
- **Final transcript:** unchanged. The batch Scribe v2 Medical call runs after End visit. The audio is billed twice (live + batch), which is accepted.
- **Prompt scope:** the checklist and open items are primary. Free-form **clinical** questions only at confidence ≥ 0.9 (e.g. a new drug with a known interaction or allergy risk). Every card shows its source: Checklist / Open item / Clinical.
- **Recording screen:** waveform + timer + a small **coverage meter** ("Checklist 7/13 covered") that expands to per-item status. **No transcript shown.**
- **Pacing:**
  - A check runs about every 20 s, and only after ≥ 12 new words.
  - At most 3 prompts per visit, at least 45 s apart, one card on screen at a time.
  - No prompt in the first 30 s.
  - The Gemini daily cap goes from 150 to **400**.
- **Prompt UX:** a soft chime + card, with a dismiss X. It auto-changes to "Captured ✓" when later covered and fades after 4 s. An unanswered card expires after 90 s.
- **Review integration:** all three: "Asked live ✓" / "Prompted live · dismissed" marks in GapsPanel, a new `gapsCaughtLive` metric, and audit-trail events shown on the signed note page.
- **Demo safety:** scripted replay + live mic. A **new ~2:45 copilot demo conversation** (TTS) plays aloud and streams through the same realtime path. The scripted doctor asks each prompted question after the prompt appears, so the audience sees prompt → answer → Captured ✓. The current 75 s demo and `data/fixtures/demo/*` stay **untouched**.

### Hard rules (carried over)
- Keys only in `.env.local`. Before every commit, run `git grep --cached` for key prefixes; it must come back empty.
- Before every commit: `npm run lint`, `npm run typecheck`, `npm test` pass.
- Commit after each phase. **No push, no DB migration against Tiger, and no live-API test runs beyond what each phase specifies** without the user's go-ahead.
- Every external call counts against a cap in `lib/usage.ts`.
- **Never add Claude attribution trailers** to commits in this repo.

### Before Phase 16 (housekeeping)
- The 4 UI fixes from this session are uncommitted: opaque dialog/palette panes, dropdown option colours, Ctrl K hint, BP chart ticks. Commit them first as their own commit (user decides), so the copilot diff stays clean.
- Rosa's chart medication fix (duplicate lisinopril) is still pending the user. It doesn't block this plan, but the copilot demo uses Rosa, so her chart should read `lisinopril 20 mg daily` before Phase 20's dry run.

---

## Phase 16: Spike, prove Realtime works (0.5 h, go/no-go)

**Goal:** confirm token → WebSocket → committed transcript before building on it.

**You provide:** nothing new. It uses the existing `ELEVENLABS_API_KEY`.

**Build**
- Copy this plan into the repo as `COPILOT_PLAN.md`.
- `app/api/visits/[visitId]/copilot/token/route.ts` (minimal): `requireDoctorApi` → `loadVisit` → `assertStatus(["created","recording"])` → `getClient().tokens.singleUse.create("realtime_scribe")` → `{ token }`. Export `getClient()` from `lib/stt/elevenlabs.ts` (it's currently internal).
- `lib/copilot/client/realtimeStt.ts` (browser-only adapter, **raw WebSocket, no new dependency**):
  - `connect({ token, keyterms, onCommitted, onPartial?, onError })` returns `{ sendPcm(Int16Array), close() }`.
  - URL: `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=…&audio_format=pcm_16000&commit_strategy=vad&language_code=en`
  - Sends `{ message_type: "input_audio_chunk", audio_base_64, sample_rate: 16000 }`.
  - Handles `committed_transcript`, `partial_transcript` and error types (`auth_error`, `quota_exceeded`, `rate_limited`, `session_time_limit_exceeded`, `input_error`…).
- A throwaway dev check: stream ~10 s of `data/fixtures/demo/demo.wav` PCM and log the events.

**Risks & mitigations**
- The documented message or field names differ from reality. Log the actual event names in the spike and fix the adapter. If the handshake is wrong, swap to `@elevenlabs/client` `Scribe.connect` (manual audio mode) **behind the same adapter interface**.
- Realtime isn't available on the free plan. The spike fails fast and the fallback decision comes back to the user (browser speech recognition behind the same adapter).

**Acceptance:** committed text for the demo lines arrives within about 2 s of each line ending. The event names are written into a comment in `realtimeStt.ts`.

**Cost:** 1 token, about 10–15 s of realtime audio, 0 Gemini.

---

## Phase 17: Contracts, storage, pure logic + tests (1 h)

**Goal:** all decision logic is pure and unit-tested before any UI.

**Build**
- **Storage:** a new nullable `visits.copilot` jsonb column.
  - Why not `metrics`: it's rewritten by read-modify-write in the audio, process and patch paths, so in-flight copilot checks would clobber each other.
  - Files: `drizzle/0002_visit_copilot.sql` (`ALTER TABLE "visits" ADD COLUMN "copilot" jsonb;`) + a journal and snapshot entry via `npm run db:generate`.
  - Schema: `copilot: jsonb("copilot").$type<CopilotState>()` in `lib/db/schema.ts`.
  - It's additive, so it's safe for teammates on older code. `visitView()` passes it to the client automatically.
- **`lib/contracts/copilot.ts`** (exported from `lib/contracts/index.ts`):
  ```ts
  CoverageStatus = "covered" | "partial" | "missing" | "unknown" | "not_applicable"
  CoverageItem  = { itemId, label, priority: "required"|"recommended", source: "template"|"open_item",
                    condition: string|null, status: CoverageStatus, evidenceQuote: string|null, updatedAtSecond: number }
  LiveSegment   = { id, text, atSecond }                       // committed text only
  Suggestion    = { id, itemId: string|null, source: "checklist"|"open_item"|"clinical",
                    question, reason, confidence, status: "shown"|"dismissed"|"captured"|"expired",
                    atSecond, shownAt, resolvedAt: string|null }
  CopilotState  = { version: 1, mode: "live"|"replay", status: "listening"|"error"|"ended",
                    checks, lastCheckSecond, lastWordCount, coverage: CoverageItem[], suggestions: Suggestion[],
                    realtimeSecondsReserved, error?: string }
  CheckBody     = { mode, elapsedSeconds, segments: LiveSegment[] (≤ 400) }
  CheckResponse = { coverage, suggestions, visible: Suggestion|null, skipped?: "busy"|"offline"|"limit" }
  ```
- `ReviewMetricsSchema` adds `gapsCaughtLive: z.number().optional()`. Optional so old signed visits still parse; readers use `?? 0`.
- `VisitRuntimeSchema` adds `demoSet: z.enum(["demo","copilot"]).optional()`.
- **Pure modules, `lib/copilot/`:**
  - `config.ts`:
    - `MIN_CHECK_INTERVAL_S=20`, `MIN_NEW_WORDS=12`, `MAX_PROMPTS=3`, `COOLDOWN_S=45`, `QUIET_START_S=30`
    - `UNCONDITIONED_MIN_S=60`, `EXPIRE_S=90`, `MAX_CHECKS_PER_VISIT=30`, `MAX_QUESTION_WORDS=15`
    - `THRESH = { checklist: 0.75, open_item: 0.75, clinical: 0.9 }`
  - `segments.ts`:
    - `appendCommitted(segs, text, atSecond)` dedupes and drops empties.
    - `wordCount(segs)`.
    - `transcriptText(segs)` renders `[mm:ss] text` lines.
    - `shouldCheck({ elapsed, lastCheckSecond, words, lastWordCount, inFlight, checks })`.
  - `coverage.ts`:
    - `initialCoverage(checklist, template)`.
    - `mergeCoverage(prev, llmItems, atSecond)`. Coverage is monotonic: covered never goes back down, and partial can only rise. `not_applicable` can become `missing` once `conditionMet`. Unknown ids are ignored.
    - `meterCounts(coverage)` returns `{ covered, total }`, excluding `not_applicable`.
  - `gate.ts`:
    - **`applyResolutions(state, coverage, resolvedIds, dismissedIds, elapsed, now)`** returns `{ state, transitions[] }`:
      - A shown suggestion whose item is now covered becomes `captured`.
      - A clinical suggestion in `resolvedIds` becomes `captured`.
      - A suggestion older than `EXPIRE_S` becomes `expired`.
      - A dismissed one becomes `dismissed`.
    - **`pickSuggestion(state, candidates, coverage, elapsed)`** returns `Suggestion | null`. It rejects when any of these hold:
      - `elapsed < QUIET_START_S`
      - a card is already `shown`
      - 3 prompts have already been made (any status)
      - the last prompt was less than 45 s ago
      - the confidence is below `THRESH[source]`
      - the item isn't `missing`
      - the itemId was already prompted
      - the item is conditioned without `conditionMet === true`
      - the item is unconditioned, `elapsed < UNCONDITIONED_MIN_S`, and the candidate isn't `aboutCurrentTopic`
      - the question has more than 15 words

      What survives is ranked required → open item → recommended → clinical, then by confidence.
  - `review.ts`: `liveMarks(copilot)` returns a Map from itemId to `"asked_live" | "dismissed_live"`. `gapsCaughtLive(copilot)` counts `captured`.
  - `replay.ts`: `timelineAt(timeline, elapsed)` for the Gemini fallback fixture.
  - `lock.ts`: a per-visit promise-chain lock shared by the check and dismiss routes.

**Tests** (`lib/copilot/*.test.ts`, pure, fixture JSON, like the existing `lib/**/*.test.ts`):
- gate: quiet start, one visible, cap 3 (dismissed and expired count), 45 s cooldown, per-source thresholds, conditioned needs `conditionMet`, unconditioned under 60 s needs `aboutCurrentTopic`, never re-prompts, priority order, only `missing` is promptable, questions over 15 words rejected.
- coverage: monotonic merge, n/a → missing, unknown ids ignored, meter excludes n/a.
- resolutions: covered → captured, clinical resolvedIds, 90 s expiry, idempotent dismiss.
- segments: dedupe, word count, `shouldCheck` (interval, 12 words, in-flight, max checks).
- review: `liveMarks`, `gapsCaughtLive`.

**Risks & mitigations:** the migration touches the shared Tiger DB. It's additive and nullable. **Applying it needs the user's go-ahead** (it applies when the app next calls `getDb()` / `npm run db:migrate`). Teammates need to pull.

**Acceptance:** `npm test`, `npm run typecheck`, `npm run lint` all green. The migration SQL is reviewed but not yet applied.

**Cost:** 0.

---

## Phase 18: Server routes, prompt, caps (1.25 h)

**Goal:** a check endpoint that turns "transcript so far" into coverage plus at most one vetted suggestion.

**Build**
- **`lib/llm/prompts/liveCoverage.ts`**
  - Output schema (zod):
    ```ts
    { items: [{ itemId, status: CoverageStatus, conditionMet: boolean|null, evidenceQuote: string|null }],
      candidates: [{ itemId: string|null, source, question, reason, confidence, aboutCurrentTopic }] (max 3),
      resolvedSuggestionIds: string[] }
    ```
  - System prompt rules (adapted from `auditNote.ts`):
    - You are silently monitoring a live, partial, unlabeled transcript that may contain ASR errors. The visit is still in progress.
    - `covered` only if the conversation specifically addressed the item. `open:` items need that specific follow-up, not the general topic.
    - `partial` means touched on but incomplete. `missing` means not yet addressed. `unknown` means the transcript is too short or ambiguous. **Prefer `unknown` early.**
    - If an item's condition isn't met yet, use `not_applicable` with `conditionMet: false` (e.g. allergies before any new medication is mentioned).
    - Chart facts are background only. Known from the chart doesn't mean covered.
    - Candidates only for high-value missing items worth asking now. They must be short, natural, 15 words or fewer, speakable aloud. No diagnosis or treatment advice, never repeat something already asked, never mention AI.
    - `clinical` (itemId null) only for a clear safety issue, with confidence ≥ 0.9.
    - **An empty candidates list is the normal answer.**
  - The user prompt includes the checklist (`itemId: label (condition)`), `chartContextText`, `transcriptText(segments)`, the previous coverage, and the suggestions already shown (id + question + status).
- **`lib/llm/gemini.ts`:** add optional `retries?: number` to `GenerateArgs`. Copilot uses `retries: 0` so a slow call can't snowball. Default behaviour is unchanged.
- **Token route (full version):**
  - `COPILOT_ENABLED !== "false"` check.
  - `reserveRealtime(maxRecordingSeconds)` + `reserveRealtimeToken()`.
  - Mints the token.
  - Writes the initial `copilot` state (coverage from `buildChecklist(getTemplate(visit.visitType), await getOpenItems(patient.id))`).
  - Returns `{ token, keyterms, maxSeconds }`. Keyterms are the template `keyterms` + the patient's med names, as in the batch STT.
- **`app/api/visits/[visitId]/copilot/check/route.ts`:**
  - If another check is in flight for the visit, return `{ skipped: "busy" }` immediately (no waiting).
  - `assertStatus(["created","recording"])`. `MAX_CHECKS_PER_VISIT` → `{ skipped: "limit" }`.
  - `withTimeout("copilot", generateJson({ …, temperature: 0.1, retries: 0, label: "copilot" }), 12000)`.
  - Then `mergeCoverage` → `applyResolutions` → `pickSuggestion`, under `lock.ts`. Persist with `updateVisit(id, { copilot })`.
  - Log `copilot_suggested` / `copilot_captured` / `copilot_dismissed` / `copilot_expired` with payload `{ suggestionId, itemId, source, question, atSecond }`.
  - Append each good response to `data/fixtures/last_good/copilot_timeline.json` (`{ atSecond, result }`).
  - **On Gemini failure:** in replay mode with `demoFallbackEnabled()`, use `timelineAt(copilot fixture, elapsed)` through the same gate. Otherwise return the current state with `skipped: "offline"`.
- **`…/copilot/suggestions/[suggestionId]/route.ts`:** `{ action: "dismiss" }` under the lock, logs the event.
- **`…/copilot/stop/route.ts`:** `{ realtimeSeconds }` → `settleRealtime(reserved, used)` refunds unused seconds, sets `status: "ended"`. Allowed in any status (upload may already be done).
- **`lib/usage.ts`:**
  - `Usage` gets `realtimeSeconds` and `realtimeTokens`.
  - `LIMITS.realtimeSeconds` (`REALTIME_DAILY_MINUTES || 60`) and `LIMITS.realtimeTokens` (`REALTIME_DAILY_TOKEN_LIMIT || 30`).
  - `geminiCalls` default becomes **400**.
  - New `reserveRealtime`, `reserveRealtimeToken`, `settleRealtime`.
- **`lib/db/schema.ts` `EventType`:** add `copilot_suggested | copilot_dismissed | copilot_captured | copilot_expired`.
- **`.env.example`:** add `COPILOT_ENABLED`, `REALTIME_DAILY_MINUTES`, `REALTIME_DAILY_TOKEN_LIMIT`. Update the `GEMINI_DAILY_CALL_LIMIT` comment.

**Risks & mitigations**

| Risk | Mitigation |
|---|---|
| Gemini latency 3–8 s | 12 s timeout, skip-if-busy, `retries: 0` |
| The model over-marks `missing` early, causing noisy prompts | `unknown` status, 30 s quiet start, unconditioned-60 s rule, confidence thresholds, cap of 3 |
| `withTimeout` doesn't cancel the underlying call (it still counts usage) | Accepted; the cap covers it |
| The file-based usage counter has no lock | Accepted at hackathon scale (unchanged from today) |

**Acceptance:** 3–4 manual `curl`/`fetch` calls to `check` with slices of the copilot script text (from Phase 20's `script.json`, or hand-written):
- no prompt before 30 s
- the kidney-lab prompt after the small-talk slice
- the allergy prompt after the losartan slice
- both become `captured` after the answer slices
- dismiss works

**Cost:** about 4–6 Gemini calls, 0 audio.

---

## Phase 19: Recording-screen client (1.5 h), first demoable

**Goal:** the live mic works end to end, with card, chime and meter.

**Build**
- **`app/app/visits/[visitId]/record/pcmTap.ts`:**
  - An `AudioWorkletNode` from an inline Blob URL (no public asset).
  - Downsamples Float32 at `ctx.sampleRate` to **16 kHz Int16**, batches 100 ms (1,600 samples), base64 → `sendPcm`.
  - Takes any `AudioNode`, so the mic and replay share it.
- **Mic source:** tap the **existing** `getUserMedia` stream (`createMediaStreamSource`, like the waveform analyser). One permission, and `MediaRecorder` is untouched.
- **`useCopilot.ts`** (same folder):
  - `start({ source: AudioNode, mode })` → POST token → `realtimeStt.connect`.
  - On committed text: `appendCommitted`.
  - A 5 s tick asks `shouldCheck`; if yes, POST `check`.
  - Chip state: `off | connecting | listening | error`.
  - A WebSocket error or close gives the `error` chip. **Nothing throws out of the hook.**
  - `stop()` closes the socket and fires `/copilot/stop` with `keepalive: true`. Fire-and-forget; **never awaited before upload.**
- **`components/chime.ts`:** `playChime()`. Two soft sine notes (880 → 1320 Hz, about 120 ms each, exponential gain envelope) on an AudioContext created from the Start click (autoplay-safe).
- **`SuggestionCard.tsx`:**
  - Shows "Consider asking:", the question, a source badge (Checklist / Open item / Clinical) and a dismiss X (optimistic update, then POST).
  - Captured state: "Captured ✓", fades after 4 s.
  - Styled with `monitor-*` tokens, with an `aria-live="polite"` region.
- **`CoverageMeter.tsx`:** "Checklist 7/13 covered" with a thin bar. Click to expand per-item dots (covered / partial / missing / unknown / n-a) with labels. No transcript anywhere.
- **`Recorder.tsx`:**
  - Call `copilot.start` after `rec.start()`, and `copilot.stop()` first in `stop()`.
  - The card and meter go after the length-cap rail; the status chip goes in the header strip.
  - `page.tsx` passes `copilotEnabled`.

**Risks & mitigations**
- An AudioWorklet isn't available. Fall back to a `ScriptProcessorNode` (deprecated but works in Chrome).
- The token expires after 15 min. That's longer than the 10-min recording cap, so it's fine.
- The chime is too loud or distracting. Gain around 0.08, and a mute toggle on the chip is a stretch goal.

**Acceptance**
- A 60 s live mic test shows the meter move and at least one sensible prompt, or honest silence.
- With a junk key or no network, the chip shows "Copilot off" and recording, upload and processing are **identical** to today.
- Never two cards at once.

**Cost:** 1 token, about 60 s realtime, about 3 Gemini.

---

## Phase 20: Copilot demo script + replay mode (1.5 h), demo safety

**Goal:** a repeatable on-stage demo with real AI, independent of the room mic.

**You provide:** OK on the script wording below (edit freely). A Windows machine to run the SAPI generator (same as the existing demo).

**Build**
- **Script** (`scripts/make-copilot-audio.ps1`, a copy of the existing generator; David = doctor, Zira = patient; about 2:45):
  1. **0:00–0:55 covers everything else:**
     - Cough for 3 weeks.
     - Fever, shortness of breath, chest pain, headache or vision (red flags).
     - "Lisinopril 20, missed one day" (adherence + dose).
     - "Anything besides the cough?" (side effects).
     - Home log "130s over 80s" (closes the home-BP open item).
     - BP today 136/86.
     - Salt.
  2. **0:55–1:30:** patient small talk (walks with her daughter, sleep, energy). *The kidney-lab prompt should fire around 1:00–1:20.*
  3. **1:35:** Doctor: "Did you get the blood work we ordered, kidney function and potassium?" Patient: "Yes, two weeks after starting; both normal." **→ Captured ✓**
  4. **1:50:** Doctor: switch lisinopril to losartan 50 mg daily for the cough. Then about 25 s of patient questions (dizziness, time of day). *The allergy prompt should fire around 2:05–2:25* (≥ 45 s after the first).
  5. **2:30:** Doctor: "Before I send it, any drug allergies?" Patient: "Just sulfa drugs, a rash." **→ Captured ✓**
  6. **2:40:** Recheck in four weeks; thanks.
- `scripts/build-demo-fixture.ts` gets `--dir copilot`. The default stays `demo`, so current behaviour is unchanged. It also writes `script.json` (`[{ speaker, text, start, end }]`). npm script: `demo:copilot`.
- Output goes to `data/fixtures/copilot/` (`copilot.wav`, `transcript.json`, `utterances.json`, `script.json`, later `timeline.json`).
- **`GET app/api/copilot/demo/[file]/route.ts`:** serves `audio | script | timeline` from `data/fixtures/copilot`. Doctor-only, gated by `demoFallbackEnabled()`.
- **Replay mode in `Recorder.tsx`:** a "Play copilot demo" button next to "Load demo visit".
  - `decodeAudioData` → `AudioBufferSourceNode` → speakers **and** `pcmTap`. Real-time pacing, so prompts land on cue.
  - Same `start_recording` PATCH, same card and meter.
  - **Text fallback:** if STT errors or nothing commits within 10 s, feed `script.json` lines to `appendCommitted` at their `end` times.
  - **On audio end:** `copilot.stop()`, then `POST /audio?demo=copilot`, then `/process`.
- **Audio route:** `?demo=copilot` copies `copilot.wav` and sets `metrics.demoSet = "copilot"`.
- **`lib/fixtures.ts`:** `fixtureDir(set)`, `demoAudio(set)`, `loadDemoFixture(step, schema, set = "demo")`. `switchToDemo` in `lib/pipeline.ts` uses `visit.metrics?.demoSet`. If a copilot fixture is missing, it falls back to the `demo` set (known mismatch, accepted).
- **After one good run:** `npm run fixtures:promote -- --set copilot <visitId>` (extend `scripts/promote-fixtures.ts` with `--set`). This saves the note, audit and followthrough, and moves `last_good/copilot_timeline.json` to `copilot/timeline.json`.

**Risks & mitigations**

| Risk | Mitigation |
|---|---|
| Prompt timing depends on check cadence plus Gemini latency | ≥ 35 s between each intended trigger and the scripted ask; verified in one dry run; adjust the small-talk length if needed |
| SAPI voices mis-transcribed live | Keyterms (losartan, lisinopril, potassium, sulfa) are sent; the text fallback covers the worst case |
| Rosa's chart has the duplicate lisinopril | Fix before the dry run (see housekeeping) |

**Acceptance**
- One full replay shows both prompts, both Captured ✓, and processing reaches review.
- The replay works with Wi-Fi off after promotion (text fallback + timeline fixture + batch fixtures).
- `git diff data/fixtures/demo` is empty.

**Cost:** one full run: 1 token, about 165 s realtime, about 8 Gemini (copilot) + 3 Gemini (pipeline) + about 165 s batch STT (about 180 ElevenLabs credits total).

---

## Phase 21: Review integration + audit trail (1 h)

**Goal:** the before-vs-after story is visible after the visit.

**Build**
- **GapsPanel marks:**
  - `Review.tsx` passes `visit.copilot` to `GapsPanel.tsx`.
  - Using `liveMarks()`, covered rows that were prompted live get an **"Asked live ✓"** badge.
  - Missing rows whose prompt was dismissed or expired get a muted **"Prompted live · dismissed"**.
  - Gap status still comes **only** from the batch audit.
- **Metric:**
  - `gapsCaughtLive` = suggestions with status `captured`.
  - `computeReviewMetrics` gets a `copilot` argument, passed from `app/api/visits/[visitId]/sign/route.ts`.
  - Show it in the follow-through "Review stats" (`FollowThroughView.tsx`, next to "gaps caught") and as a chip in the review header.
- **Audit trail:**
  - `getVisitEvents(visitId)` in `lib/queries.ts`.
  - `components/AuditTrail.tsx` has readable labels for **all** event types and shows the copilot question text.
  - Rendered as a collapsible card on `app/app/visits/[visitId]/note/page.tsx`.
  - This also delivers the unbuilt NEXT_STEPS 15.3.

**Acceptance:** after the Phase 20 run, review shows 2 "Asked live ✓", follow-through stats show "2 caught live", and the note page lists suggested → captured events with times.

**Cost:** 0.

---

## Phase 22: Status page + final regression (0.5 h)

**Build**
- `lib/health.ts`: a "Live copilot (Scribe Realtime)" row. It's configured when the key is set and `COPILOT_ENABLED` isn't false. Config check only, no billable call.
- `app/app/status/page.tsx`: meters for realtime minutes and tokens. The Gemini meter shows /400.
- Browser regression pass (the scratchpad Playwright tour from this session), dark/grey/light:
  - the record page idle, recording with a card, captured
  - review with badges
  - note page audit trail

**Acceptance:** the status page shows the copilot row and meters without changing the usage counters. The regression screenshots have no overlap or contrast issues.

**Cost:** 0.

---

## Cut line (about 7.5 h of build before the 10:00 freeze)

| Phase | Est. | Priority | If you stop after it |
|---|---|---|---|
| 16 Spike | 0.5 h | Must | Know Realtime works |
| 17 Contracts + pure logic + tests | 1 h | Must | – |
| 18 Server + prompt + caps | 1.25 h | Must | – |
| 19 Recording UI (card, chime, meter) | 1.5 h | Must | **Live mic demo works** |
| 20 Copilot script + replay | 1.5 h | Must | **Safe stage demo** |
| 21 Review marks + metric + audit trail | 1 h | Should | Full before/after story |
| 22 Status + regression | 0.5 h | Should | Polish |

**Stretch, only if time remains:** mute toggle on the chime, the Gemini-offline timeline fixture wired for **live** mode (it's replay-only in the plan), partial-transcript "listening…" shimmer.

---

## Verification after all phases

1. `npm test`, `npm run typecheck`, `npm run lint` are green.
2. Live mic, 60 s: the meter moves, at most 1 sensible prompt, and End visit processes normally.
3. Copilot replay: chime + "Consider asking" around 1:10 (kidney labs), Captured ✓ around 1:40; second prompt around 2:15 (allergies), Captured ✓ around 2:35. Review shows "Asked live ✓" ×2, stats "2 caught live", and the note page audit trail lists the events.
4. **Failure drills:**
   - Junk ElevenLabs key: replay uses the text fallback, and plain recording is unaffected.
   - `GEMINI_DAILY_CALL_LIMIT=0`: replay uses the timeline fixture, and live shows "Copilot off" quietly.
   - Wi-Fi off: replay still completes.
5. "Load demo visit" is unchanged, and `git diff data/fixtures/demo` is empty.
6. The key-prefix `git grep --cached` is empty before each commit.

**Total live API budget:** about 4 min of realtime audio, about 25 Gemini calls, about 3 min of batch STT (roughly 400 ElevenLabs credits).

---

## What you need to do, in order

| When | You do |
|---|---|
| Now | Approve this plan. Decide whether to commit the 4 pending UI fixes first (recommended). Fix Rosa's medication list or let me do it. |
| Phase 16 | Nothing. I report whether Realtime works on your key. |
| Phase 17 | **Approve applying migration `0002_visit_copilot.sql` to Tiger** (additive, nullable column). Tell teammates to pull. |
| Phase 18–19 | Approve the few live test calls; try the live mic for 60 s yourself. |
| Phase 20 | Review the script wording; run the generator on Windows (or let me run it); approve one full demo run and fixture promotion. |
| Phase 21–22 | Look at review, follow-through and note pages; confirm the story reads well. |
| Before demo | Open Status 5 min early; have the hotspot ready; practise one replay and one live-mic run. |
| Push | Only when you say so. |
