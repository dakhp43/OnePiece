# PATIENTS_PLAN.md: Add and edit patients (phases P1–P5)

> **Audience:** the coding agent and the team. Build the phases in order; each has what you provide, what gets built, risks, acceptance checks and cost.

---

## Context

Carryover only has the seeded patients (Rosa, James, Aisha for Dr. Patel). There is no way to register a new patient, so the product can't be shown with a new patient walking in, and patients can't be corrected once they exist. This adds:
- **Add patient:** a button + dialog on My patients, also reachable from Ctrl K.
- **Edit patient:** a button on the patient page, reusing the same form.
- **Known conditions:** a new, small field, shown on the patient page.

It also fixes three things the new patients would expose:
- A new patient's first page open would spend paid Backboard/Gemini calls summarizing an empty chart.
- "Other" sex would show as a raw code in several views.
- The brief cache doesn't notice medication edits.

The app already renders a patient with no visits, vitals or open items safely ("No visits yet", "None on file", empty BP chart).

### Decisions made (from Q&A, don't reopen)
- **Entry:** "Add patient" button in the My patients header opens a dialog (like Start visit). A "New patient" action in the Ctrl K command palette.
- **Fields:**
  - required: first name, last name, date of birth, sex (F / M / Other)
  - optional: email, preferred language (English/Spanish), medications (name, dose, how often), allergies, known conditions
- **Conditions:** quick-pick chips (Hypertension, Type 2 diabetes, High cholesterol, Asthma, COPD, CKD, Depression, Hypothyroidism, Obesity, GERD) plus free text. Stored as a list of names.
  - Shown **only** as a card on the patient page, and as a short line in the patient list row.
  - Not used by the brief, the copilot or the note.
  - For a patient with no signed visit, Hypertension or Type 2 diabetes pre-selects the matching visit type in Start visit.
- **After save:** go to the new patient's page.
- **Extras:** Edit patient details, yes. No duplicate warning, no delete.
- **Sex "Other":** stored as `"X"`, displayed as "Other". Existing patients stay F/M.

### What exists and gets reused (verified in code)

| Need | Existing piece |
|---|---|
| Patient row | `patients` in `lib/db/schema.ts`: `firstName`, `lastName`, `dob` (date string), `sex` (plain text), `email` (nullable), `preferredLanguage` (en/es check), `knownMedications` (jsonb), `knownAllergies` (jsonb), `backboardAssistantId`, `createdAt` |
| Medication shape | `MedicationSchema` `{name, dose, frequency}` in `lib/contracts/visit.ts` |
| Access checks | `requireDoctorApi()` (`lib/auth/current.ts`), `loadPatient(patientId, doctorId)` → 404/403 (`lib/access.ts`) |
| Route helpers | `route()`, `readJson()`, `ApiError` (`lib/api.ts`); zod errors come back as 400 `{error, details}` |
| Existing routes | `GET app/api/patients/route.ts` (list), `GET app/api/patients/[patientId]/route.ts` (detail); POST and PATCH go next to them |
| Modal form pattern | `app/app/patients/[patientId]/StartVisitButton.tsx` + `components/ui/dialog.tsx` + `components/ui/form.tsx` |
| List data | `listPatients()` in `lib/queries.ts` (selects explicit columns; handles no history) |
| Audit trail | `logEvent(type, {visitId, doctorId, payload})` in `lib/events.ts`; `EventType` union in `lib/db/schema.ts` |
| Brief | `getBrief()` in `lib/memory/brief.ts`; `chartBrief()` deterministic fallback in `lib/memory/chart.ts` |

### Hard rules (carried over)
- Before every commit: `npm run lint`, `npm run typecheck`, `npm test` pass.
- Commit after each phase. **No push, and no migration or test data written to shared Tiger, without the user's go-ahead.**
- Never add Claude attribution trailers to commits.

---

## P1: Contracts, validation, migration (40 min)

**Goal:** one source of truth for what a valid patient is, tested before any UI.

**You provide:** OK to apply migration `0003` to Tiger (after the file is reviewed).

**Build**
- Copy this plan into the repo as `PATIENTS_PLAN.md`.
- `lib/db/schema.ts`:
  - `patients.conditions`: `jsonb("conditions").$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)`.
  - `EventType` gets `"patient_created" | "patient_updated"` (type only).
- `npm run db:generate` produces `drizzle/0003_*.sql`. It must contain only `ALTER TABLE "patients" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;`.
  - Pull first, so no teammate `0003` clashes.
  - **Stop the dev server before generating**: the app applies migrations on its first DB connection.
- **`lib/contracts/patient.ts`** (exported from `lib/contracts/index.ts`):
  - `SEX = ["F","M","X"]`, `COMMON_CONDITIONS` (the 10 chips above).
  - **`PatientInputSchema`:**
    - `firstName`, `lastName`: trimmed, 1–60 chars.
    - `dob`: `YYYY-MM-DD`, a real date, not in the future, age ≤ 120.
    - `sex`: `z.enum(SEX)`.
    - `email`: trimmed and lowercased; empty becomes null; otherwise a valid email, max 200.
    - `preferredLanguage`: en/es.
    - `knownMedications`: at most 30. Name 1–80 chars, dose and frequency 0–60 chars.
    - `knownAllergies`, `conditions`: at most 30 each, 1–80 chars each.
  - **`normalizePatientInput(raw)`**, run before parsing:
    - drop fully blank medication rows
    - trim text and collapse repeated spaces
    - dedupe allergies and conditions ignoring case (keep the first spelling)
    - dedupe medications with the same name and dose
  - `PatientPatchSchema` = `PatientInputSchema.partial()`.
  - `medsChanged(a, b)`.
  - `visitTypeForConditions(conditions, fallback)`: Type 2 diabetes → `t2dm_followup`, else Hypertension → `htn_followup`, else the fallback.
- **`lib/utils.ts`:** `sexLabel(s)`: F → "F", M → "M", anything else → "Other".

**Tests** (`lib/contracts/patient.test.ts`):
- Names are trimmed; blank names are rejected.
- Rejected dates: in the future, age over 120, and `2026-02-30`.
- Email: empty becomes null, lowercased, invalid is rejected.
- Blank medication rows are dropped; a row with a dose but no name is rejected.
- Allergy and condition dedupe ignores case.
- `sex: "Other"` is rejected and `"X"` accepted.
- `medsChanged`, `visitTypeForConditions` (diabetes wins, hypertension alone, fallback), `sexLabel`.

**Risks & mitigations:**
- The migration touches the shared database. It is additive, so existing rows get `[]` and teammates' older code keeps working.
- It's applied only after the user's OK (`npm run db:migrate`), then the dev server is restarted.

**Acceptance:** tests, typecheck and lint pass. The migration SQL is exactly one `ADD COLUMN`. It's applied only with approval, then the column is confirmed with a read-only query.

**Cost:** 0 API calls.

---

## P2: API routes (30 min)

**Goal:** create and edit patients safely, scoped to the signed-in doctor.

**Build**
- **`POST` in `app/api/patients/route.ts`:**
  - `requireDoctorApi()`, then `readJson(req, (v) => PatientInputSchema.parse(normalizePatientInput(v)))`.
  - Insert with `doctorId` from the session (never from the body), returning `{ id }`.
  - `logEvent("patient_created", { doctorId, payload: { patientId } })`, then 201 `{ id }`.
- **`PATCH` in `app/api/patients/[patientId]/route.ts`** (same `RouteContext` pattern as its GET):
  - `loadPatient` checks access; then parse with `PatientPatchSchema`; then update.
  - If `medsChanged`: `logEvent("medications_updated", { visitId: null, doctorId, payload: { patientId, before, after } })`, the same shape `applyMedicationList` uses.
  - Always `logEvent("patient_updated", { payload: { patientId, fields } })`, then `{ id }`.
- `listPatients` in `lib/queries.ts` also selects `conditions`. `loadPatient` uses `select()`, so it already gets the column.

**Risks & mitigations:** a doctor editing another doctor's patient is blocked by `loadPatient` (403). An oversized payload is capped by the zod limits.

**Acceptance:** typecheck passes. Validation cases are covered by P1 tests. Live behaviour is checked in P5.

**Cost:** 0.

---

## P3: Brief fixes for new and edited patients (20 min)

**Goal:** opening a new patient costs nothing, and briefs stay current after edits.

**Build (`lib/memory/brief.ts`, `app/app/patients/[patientId]/BriefCard.tsx`):**
- **Empty chart:** in `getBrief`, after `loadChartContext`, if there are no signed visits, open items or vitals, return `{ bullets: chartBrief(patient, ctx), source: "chart" }` immediately. No Backboard assistant is created, and no Gemini call is made.
- **Cache key:** add a short hash of `knownMedications` + `knownAllergies`, so an edit refreshes the brief instead of serving a stale one for up to 12 h.
- **BriefCard:** when there are no bullets, show "New patient, no history yet. The brief fills in after the first signed visit."

**Acceptance:** opening a brand-new patient logs no Backboard or Gemini call in the server output.

**Cost:** 0 (saves 2 Backboard calls per new patient).

---

## P4: UI: form, buttons, pages, command palette (1.5 h)

**Goal:** add and edit a patient in under a minute, in all three themes.

**Build**
- **`components/PatientForm.tsx`** (client; shared by Add and Edit):
  - `<Dialog className="max-w-2xl" title="Add patient" | "Edit patient">`, body scrolls.
  - **Layout:**
    - first and last name side by side
    - date of birth (`type="date"`, max today)
    - sex as F / M / Other pill radios (same accessible pattern as Start visit's visit-type cards)
    - language select
    - email (optional)
  - **`MedicationRows`:** name / dose / how often inputs, a remove button per row (`aria-label="Remove medication N"`), and "+ Add medication".
  - **`ChipInput`:**
    - Enter or comma adds a chip; chips are removable buttons.
    - Optional suggestion chips work as toggles (`aria-pressed`).
    - Used for allergies (no suggestions) and conditions (`COMMON_CONDITIONS`).
  - **Validation:**
    - The client runs `normalizePatientInput` + `PatientInputSchema.safeParse` before saving and shows the first error in the `role="alert"` box, the same style as Start visit.
    - Server 400 details are shown the same way.
  - **Save:** Save/Cancel footer; the button shows a spinner while saving.
    - Create: POST, then `router.push('/app/patients/<id>')`.
    - Edit: PATCH, then `router.refresh()` and close.
- **`components/AddPatientButton.tsx`:**
  - "Add patient" (UserPlus) button plus the form.
  - Also opens when the URL has `?new=1` (for Ctrl K), then removes the parameter.
- **`app/app/patients/[patientId]/EditPatientButton.tsx`:** secondary "Edit" (Pencil) button, prefilled with the patient's current values.
- **`app/app/patients/page.tsx`:**
  - Add patient button in the header next to the stats.
  - `sexLabel` for sex.
  - Up to 2 conditions as a muted line under the name.
  - Empty state: "No patients yet. Add your first."
- **`app/app/patients/[patientId]/page.tsx`:**
  - Edit next to Start visit.
  - A **Conditions** card (stethoscope icon, chips, "None recorded." when empty) between Medications and Allergies.
  - `sexLabel` in the header.
  - Medication list key becomes `${m.name}-${i}`.
  - Start visit default: `visitTypeForConditions(conditions, "htn_followup")` only when the patient has no signed visit; otherwise last visit's type as today.
- **`sexLabel` in the other places sex is shown:**
  - `components/CommandPalette.tsx` hint
  - `app/app/visits/[visitId]/report/page.tsx`
  - `lib/pdf/render.ts`

  The prompt text can keep the raw code.
- **`components/CommandPalette.tsx`:**
  - An Actions item "New patient" that goes to `/app/patients?new=1`.
  - Reset the cached patient list when the palette closes, so new patients appear next time.

**Risks & mitigations:**
- The dialog closes on a backdrop click, which could lose a half-filled form. Accepted for now (a "discard changes?" prompt is a stretch goal).
- A tall form inside the glass dialog: check it at phone width and in all three themes during P5.

**Acceptance:** lint and typecheck pass. The form works with keyboard only (Tab, Enter adds chips, Esc closes).

**Cost:** 0.

---

## P5: End-to-end check and cleanup (30 min)

**You provide:** OK to create one test patient on Tiger, and OK to delete it afterwards.

**Steps** (browser, dark/grey/light; uses the scratchpad Playwright tour from earlier):
1. On My patients, click Add patient and save it empty. Field errors should appear.
2. Enter:
   - "Test Patient", DOB 1970-05-01, Other, Spanish
   - medication "lisinopril 10 mg daily" plus one blank row
   - allergies "Penicillin, penicillin"
   - conditions Type 2 diabetes + one typed condition
3. Save. It should land on the new patient's page, with:
   - header "56 y/o Other"
   - one allergy
   - a Conditions card with both conditions
   - the brief's new-patient message, with **no** Backboard or Gemini call in the server log
   - Start visit pre-selecting **Diabetes follow-up**
4. Edit the dose to 20 mg. The page updates without a reload, and a `medications_updated` event exists with before/after.
5. Ctrl K shows the patient, and "New patient" opens the dialog.
6. Screenshots of the list, the patient page and both dialogs in all three themes: no overlap, readable dropdowns.
7. **Cleanup (only with approval):** delete the test patient's `patient_created` / `patient_updated` / `medications_updated` events, then the patient row. Don't start a visit for it; if one was started, delete its vitals, open items and visit first.

**Acceptance:** all of the above pass; the test patient is gone afterwards.

**Cost:** 0 API calls (the brief short-circuits).

---

## What you need to do, in order

| When | You do |
|---|---|
| Now | Approve this plan. |
| P1 | Approve applying migration `0003` (one additive column) to Tiger; tell teammates to pull. |
| P5 | Approve creating one test patient and deleting it afterwards; look at the screenshots. |
| Push | Only when you say so (the copilot rework commit `fe60f8f` is also still unpushed). |

**Total estimate:** about 3.5 h. The copilot's Phase 20 (demo audio + replay) and 22 (status/regression) remain after this.
