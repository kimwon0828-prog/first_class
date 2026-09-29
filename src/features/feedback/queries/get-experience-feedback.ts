import "server-only"
import { dataAdapter } from "@/shared/lib/db"
import type { ParentFeedbackResult, StudioExperienceFeedback } from "../lib/experience-feedback"

export async function getParentExperienceFeedback(applicationId: string, parentId: string): Promise<ParentFeedbackResult> {
  try { return { status: "ok", context: await dataAdapter.getParentFeedbackContext(applicationId, parentId) } }
  catch { return { status: "error" } }
}
export async function getStudioExperienceFeedback(applicationId: string, organizationId: string): Promise<{ feedback: StudioExperienceFeedback | null; error: boolean }> {
  try { return { feedback: await dataAdapter.getStudioExperienceFeedback(applicationId, organizationId), error: false } }
  catch { return { feedback: null, error: true } }
}
