"use server"

import { revalidatePath } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { dataAdapter } from "@/shared/lib/db"
import { isParentDecision, isParentDeclineReason, isPreferredDay, isPreferredTimeMode } from "@/features/decisions/lib/parent-decision"
import { normalizeFeedbackNote, validateFeedbackInput } from "../lib/experience-feedback"
import { decisionDraftError, type ExperienceDecisionDraft } from "../lib/experience-submission"

export type FeedbackActionState = { status: "idle" | "error" | "success"; message: string; code?: "duplicate" }
export async function submitParentExperienceAction(applicationId: string, _previous: FeedbackActionState, form: FormData): Promise<FeedbackActionState> {
  const parent = await requireParentAccess({ returnTo: `/record/${applicationId}/report` })
  const invalid = (message = "입력한 내용을 확인해 주세요."): FeedbackActionState => ({ status: "error", message })
  try {
    // Independent reads fail closed. Neither read failure is interpreted as an empty response.
    const [context, existingDecision] = await Promise.all([
      dataAdapter.getParentFeedbackContext(applicationId, parent.id),
      dataAdapter.getCurrentParentDecision(applicationId)
    ])
    if (context.feedback && existingDecision) return { status: "error", code: "duplicate", message: "이미 피드백을 보냈어요." }
    if (!context.eligible || !context.programType) return invalid("체험을 마친 신청에서 피드백을 남길 수 있어요.")
    const ids = form.getAll("chip")
    const rawNote = form.get("privateNote")
    if (ids.some(id => typeof id !== "string") || (rawNote !== null && typeof rawNote !== "string")) return invalid()
    const note = normalizeFeedbackNote(rawNote as string | null)
    if (context.feedback && (ids.length || rawNote !== null)) return invalid("이미 보낸 피드백은 수정할 수 없어요.")
    if (!context.feedback) {
      const error = validateFeedbackInput(context.programType, ids as string[], note)
      if (error) return invalid(error)
    }
    let draft: ExperienceDecisionDraft | null = null
    const decision = form.get("decision")
    if (existingDecision && ["decision", "declineReason", "preferredDays", "preferredStartTime", "preferredEndTime", "preferredTimeMode"].some(key => form.has(key))) return invalid("이미 남긴 등록 의향은 수정할 수 없어요.")
    if (!existingDecision) {
      const reason = form.get("declineReason"), days = form.getAll("preferredDays"), mode = form.get("preferredTimeMode")
      if (!isParentDecision(decision) || (reason !== null && !isParentDeclineReason(reason)) || days.some(day => !isPreferredDay(day)) || (mode !== null && !isPreferredTimeMode(mode))) return invalid()
      const start = form.get("preferredStartTime"), end = form.get("preferredEndTime")
      if ((start !== null && typeof start !== "string") || (end !== null && typeof end !== "string")) return invalid()
      draft = { decision, declineReason: isParentDeclineReason(reason) ? reason : null, preferredDays: days.filter(isPreferredDay), preferredStartTime: start as string ?? "", preferredEndTime: end as string ?? "", preferredTimeMode: isPreferredTimeMode(mode) ? mode : "after" }
      const error = decisionDraftError(draft)
      if (error) return invalid(error)
    }
    // Exactly one mutation. RPC rechecks ownership, eligibility, finality under a row lock.
    await dataAdapter.submitParentExperience(applicationId, parent.id, { selectedChipIds: context.feedback ? null : ids as string[], privateNote: context.feedback ? null : note, decision: draft })
    for (const path of [`/record/${applicationId}/report`, `/record/${applicationId}`, "/record", "/notifications", "/", `/studio/applications/${applicationId}`]) revalidatePath(path)
    revalidatePath("/classes/[id]", "page")
    revalidatePath("/academy/[handle]", "page")
    return { status: "success", message: "피드백을 보냈어요." }
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "feedback_already_submitted") return { status: "error", code: "duplicate", message: "이미 피드백을 보냈어요." }
    if (code === "feedback_report_required") return invalid("현재 열람할 수 있는 리포트가 있어야 피드백을 보낼 수 있어요.")
    if (code === "feedback_decision_closed") return invalid("현재 이 신청에는 등록 의향을 남길 수 없어요. 새로고침해 주세요.")
    // Never expose SQL, identifiers or private note content in errors/logs.
    return invalid("피드백을 저장하지 못했어요. 입력한 내용을 유지했으니 다시 시도해 주세요.")
  }
}
