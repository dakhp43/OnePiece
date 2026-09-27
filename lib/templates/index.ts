import { z } from "zod";
import type { VisitType } from "@/lib/contracts";
import acuteRespiratory from "./acute_respiratory.json";
import annualPhysical from "./annual_physical.json";
import asthmaCopd from "./asthma_copd.json";
import backPain from "./back_pain.json";
import generalVisit from "./general_visit.json";
import headache from "./headache.json";
import htnFollowup from "./htn_followup.json";
import mentalHealth from "./mental_health.json";
import t2dmFollowup from "./t2dm_followup.json";
import urinarySymptoms from "./urinary_symptoms.json";

export const TemplateItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  priority: z.enum(["required", "recommended"]),
  defaultSection: z.enum(["S", "O", "A", "P"]),
  /** Plain-language hint passed to the auditor, e.g. "only if a new medication is prescribed". */
  condition: z.string().nullable(),
});
export type TemplateItem = z.infer<typeof TemplateItemSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  label: z.string(),
  keyterms: z.array(z.string()),
  items: z.array(TemplateItemSchema),
});
export type Template = z.infer<typeof TemplateSchema>;

const TEMPLATES: Record<VisitType, Template> = {
  htn_followup: TemplateSchema.parse(htnFollowup),
  t2dm_followup: TemplateSchema.parse(t2dmFollowup),
  acute_respiratory: TemplateSchema.parse(acuteRespiratory),
  asthma_copd: TemplateSchema.parse(asthmaCopd),
  mental_health: TemplateSchema.parse(mentalHealth),
  annual_physical: TemplateSchema.parse(annualPhysical),
  back_pain: TemplateSchema.parse(backPain),
  urinary_symptoms: TemplateSchema.parse(urinarySymptoms),
  headache: TemplateSchema.parse(headache),
  general_visit: TemplateSchema.parse(generalVisit),
};

export function getTemplate(type: VisitType): Template {
  return TEMPLATES[type];
}
