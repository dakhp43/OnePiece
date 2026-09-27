import { describe, expect, it } from "vitest";
import { sexLabel } from "@/lib/utils";
import { PatientInputSchema, PatientPatchSchema, medsChanged, normalizePatientInput, visitTypeForConditions } from "./patient";

const base = {
  firstName: "Maria", lastName: "Lopez", dob: "1970-05-01", sex: "F", email: "",
  preferredLanguage: "es", knownMedications: [], knownAllergies: [], conditions: [],
};
const parse = (patch: Record<string, unknown>) => PatientInputSchema.safeParse(normalizePatientInput({ ...base, ...patch }));
const firstError = (patch: Record<string, unknown>) => {
  const r = parse(patch);
  return r.success ? null : r.error.issues[0].message;
};

describe("PatientInputSchema + normalizePatientInput", () => {
  it("accepts a minimal patient and turns an empty email into null", () => {
    const r = parse({});
    expect(r.success && r.data).toMatchObject({ firstName: "Maria", email: null, knownMedications: [] });
  });

  it("trims and collapses names, and rejects blank ones", () => {
    const r = parse({ firstName: "  Ana   Maria ", lastName: " de  la Cruz " });
    expect(r.success && [r.data.firstName, r.data.lastName]).toEqual(["Ana Maria", "de la Cruz"]);
    expect(parse({ firstName: "   " }).success).toBe(false);
  });

  it("rejects impossible, future and too-old birth dates", () => {
    expect(firstError({ dob: "2026-02-30" })).toBe("Date of birth isn't a real date");
    expect(firstError({ dob: "2999-01-01" })).toBe("Date of birth can't be in the future");
    expect(firstError({ dob: "1850-06-01" })).toBe("Age can't be over 120");
    expect(firstError({ dob: "05/01/1970" })).toBe("Date of birth must be YYYY-MM-DD");
  });

  it("lowercases email and rejects a bad one", () => {
    const r = parse({ email: "  Maria.Lopez@Example.COM " });
    expect(r.success && r.data.email).toBe("maria.lopez@example.com");
    expect(firstError({ email: "not-an-email" })).toBe("Email doesn't look right");
  });

  it("accepts F, M and X, but not free text", () => {
    for (const sex of ["F", "M", "X"]) expect(parse({ sex }).success).toBe(true);
    expect(parse({ sex: "Other" }).success).toBe(false);
  });

  it("drops blank and repeated medication rows, and needs a name when a row has anything", () => {
    const r = parse({
      knownMedications: [
        { name: " lisinopril ", dose: "10 mg", frequency: "daily" },
        { name: "", dose: "", frequency: " " },
        { name: "Lisinopril", dose: "10 MG", frequency: "once a day" },
      ],
    });
    expect(r.success && r.data.knownMedications).toEqual([{ name: "lisinopril", dose: "10 mg", frequency: "daily" }]);
    expect(parse({ knownMedications: [{ name: "", dose: "10 mg", frequency: "" }] }).success).toBe(false);
  });

  it("dedupes allergies and conditions ignoring case, keeping the first spelling", () => {
    const r = parse({ knownAllergies: ["Penicillin", "penicillin ", " ", "Sulfa  drugs"], conditions: ["Type 2 diabetes", "type 2 DIABETES"] });
    expect(r.success && [r.data.knownAllergies, r.data.conditions]).toEqual([["Penicillin", "Sulfa drugs"], ["Type 2 diabetes"]]);
  });

  it("lets an edit send only the changed fields", () => {
    expect(PatientPatchSchema.safeParse(normalizePatientInput({ conditions: ["Asthma"] })).success).toBe(true);
    expect(PatientPatchSchema.safeParse(normalizePatientInput({ dob: "2999-01-01" })).success).toBe(false);
  });
});

describe("helpers", () => {
  it("detects medication changes", () => {
    const a = [{ name: "lisinopril", dose: "10 mg", frequency: "daily" }];
    expect(medsChanged(a, [{ ...a[0] }])).toBe(false);
    expect(medsChanged(a, [{ ...a[0], dose: "20 mg" }])).toBe(true);
    expect(medsChanged(a, [])).toBe(true);
  });

  it("picks the visit type from conditions, diabetes first", () => {
    expect(visitTypeForConditions(["Hypertension", "type 2 diabetes"], "acute_respiratory")).toBe("t2dm_followup");
    expect(visitTypeForConditions(["Hypertension"], "acute_respiratory")).toBe("htn_followup");
    expect(visitTypeForConditions(["Asthma"], "htn_followup")).toBe("htn_followup");
  });

  it("labels sex for display", () => {
    expect([sexLabel("F"), sexLabel("M"), sexLabel("X")]).toEqual(["F", "M", "Other"]);
  });
});
