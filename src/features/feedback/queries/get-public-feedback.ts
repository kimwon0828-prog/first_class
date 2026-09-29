import "server-only"
import { dataAdapter } from "@/shared/lib/db"
import type { PublicFeedbackSummary } from "../lib/experience-feedback"
// Missing migration / query failures fail closed. No private source or fallback query.
export async function getPublicClassFeedback(classId: string): Promise<PublicFeedbackSummary> {
  try { return await dataAdapter.getPublicClassFeedbackSummary(classId) }
  catch { return { chips: [] } }
}
export async function getPublicAcademyFeedback(organizationId: string): Promise<PublicFeedbackSummary> {
  try { return await dataAdapter.getPublicAcademyFeedbackSummary(organizationId) }
  catch { return { chips: [] } }
}
