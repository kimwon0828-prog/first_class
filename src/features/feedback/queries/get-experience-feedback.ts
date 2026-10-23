import "server-only"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioRecentExperienceFeedback } from "@/shared/lib/db/adapter"
import type { ParentFeedbackResult, StudioExperienceFeedback } from "../lib/experience-feedback"

export async function getParentExperienceFeedback(applicationId: string, parentId: string): Promise<ParentFeedbackResult> {
  try { return { status: "ok", context: await dataAdapter.getParentFeedbackContext(applicationId, parentId) } }
  catch { return { status: "error" } }
}
export async function getStudioExperienceFeedback(applicationId: string, organizationId: string): Promise<{ feedback: StudioExperienceFeedback | null; error: boolean }> {
  try { return { feedback: await dataAdapter.getStudioExperienceFeedback(applicationId, organizationId), error: false } }
  catch { return { feedback: null, error: true } }
}
/** 홈 "학부모 의견" 카드: 학원의 최근 의견 1건 + 최근 7일 새 의견 수. 읽기 전용. */
export async function getStudioRecentExperienceFeedback(organizationId: string, now = new Date()): Promise<{ data: StudioRecentExperienceFeedback; error: boolean }> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  try { return { data: await dataAdapter.getStudioRecentExperienceFeedback(organizationId, since), error: false } }
  catch { return { data: { latest: null, recentCount: 0 }, error: true } }
}
