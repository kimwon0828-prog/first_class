import type { SupabaseClient } from "@supabase/supabase-js"
import { cancelParentApplication } from "@/features/applications/lib/cancel-parent-application"
import { decodeParentFeedbackContext } from "@/features/feedback/lib/feedback-decode"
import { feedbackChipsForProgram } from "@/features/feedback/lib/experience-feedback"
import { submitParentExperienceWorkflow } from "@/features/feedback/lib/submit-parent-experience"
import { PARENT_DECISION_OPTIONS, PARENT_DECLINE_REASON_OPTIONS, PREFERRED_DAY_OPTIONS, PREFERRED_TIME_MODE_OPTIONS, isParentDecision, isParentDeclineReason, isPreferredDay, isPreferredTimeMode, getParentDecisionLabel, getParentDeclineReasonLabel, formatPreferredSchedule, formatLegacyPreferredDate } from "@/features/decisions/lib/parent-decision"
import type { DataAdapter } from "@/shared/lib/db/adapter"
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } })
type Dependencies = Parameters<typeof cancelParentApplication>[3]
export function responseAdapter(db: SupabaseClient): Pick<DataAdapter, "getParentFeedbackContext" | "getCurrentParentDecision" | "submitParentExperience"> {
  return {
    async getParentFeedbackContext(id) {
      const r = await db.rpc("get_parent_experience_feedback_context", { p_application_id: id })
      if (r.error) throw Error("feedback_load_failed")
      return decodeParentFeedbackContext(r.data)
    },
    async getCurrentParentDecision(id) {
      const { data: d, error } = await db.from("parent_decisions").select("decision, created_at, decline_reason, preferred_date, preferred_time_note, preferred_days, preferred_start_time, preferred_end_time, preferred_time_mode").eq("application_id", id).is("superseded_at", null).maybeSingle()
      if (error || (d && !isParentDecision(d.decision))) throw Error("decision_load_failed")
      if (!d) return null
      return { decision: d.decision, createdAt: d.created_at, declineReason: isParentDeclineReason(d.decline_reason) ? d.decline_reason : null,
        preferredDays: Array.isArray(d.preferred_days) ? d.preferred_days.filter(isPreferredDay) : null,
        preferredStartTime: d.preferred_start_time ?? null, preferredEndTime: d.preferred_end_time ?? null,
        preferredTimeMode: isPreferredTimeMode(d.preferred_time_mode) ? d.preferred_time_mode : null,
        preferredDate: d.preferred_date ?? null, preferredTimeNote: d.preferred_time_note ?? null }
    },
    async submitParentExperience(id, _parent, input) {
      const d = input.decision
      const { error } = await db.rpc("submit_parent_experience", { p_application_id: id, p_selected_chip_ids: input.selectedChipIds, p_private_note: input.privateNote,
        p_decision: d?.decision ?? null, p_decline_reason: d?.declineReason ?? null, p_preferred_days: d?.preferredDays.length ? d.preferredDays : null,
        p_preferred_start_time: d?.preferredStartTime || null, p_preferred_end_time: d?.preferredEndTime || null,
        p_preferred_time_mode: d?.declineReason === "schedule_mismatch" ? d.preferredTimeMode : null })
      if (error) throw Error(["feedback_already_submitted", "feedback_report_required", "feedback_decision_closed"].includes(error.message) ? error.message : "feedback_save_failed")
    }
  }
}
export async function nativeResponses(request: Request, path: string[], db: SupabaseClient, userId: string, deps: Dependencies) {
  const id = path[1], action = path[2]
  if (path.length !== 3 || path[0] !== "applications" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !["cancel", "feedback"].includes(action)) return json({error:"not_found"},404)
  if (request.method !== "POST" && !(request.method === "GET" && action === "feedback")) return json({error:"not_found"},404)
  let body: Record<string, unknown> = {}
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({error:"invalid_input"},400)
    const raw = await request.text()
    if (raw.length > 16000) return json({error:"invalid_input"},400)
    try { body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error() } catch { return json({error:"invalid_input"},400) }
  }
  if (action === "cancel") {
    if (Object.keys(body).length !== 1 || body.confirmation !== "cancel") return json({error:"invalid_confirmation"},400)
    const result = await cancelParentApplication(id, userId, db, deps)
    return json(result, result.status === "success" ? 200 : 409)
  }
  // Ownership and published report are checked before exposing any private feedback.
  const own = await db.from("my_trial_applications").select("id, status, has_current_registration_result").eq("id",id).eq("parent_id",userId).maybeSingle()
  if (own.error) return json({error:"application_unavailable"},503)
  if (!own.data) return json({error:"not_found"},404)
  const report = await db.from("experience_reports").select("id").eq("application_id",id).eq("status","published").maybeSingle()
  if (report.error) return json({error:"report_unavailable"},503)
  if (!report.data) return json({error:"report_unavailable",message:"현재 열람할 수 있는 리포트가 있어야 피드백을 보낼 수 있어요."},409)
  const adapter = responseAdapter(db)
  if (request.method === "GET") {
    const [feedback, decision] = await Promise.allSettled([adapter.getParentFeedbackContext(id,userId),adapter.getCurrentParentDecision(id)])
    const context = feedback.status === "fulfilled" ? feedback.value : null
    const d = decision.status === "fulfilled" ? decision.value : null
    const schedule = d ? formatPreferredSchedule({days:d.preferredDays,startTime:d.preferredStartTime,endTime:d.preferredEndTime,mode:d.preferredTimeMode}) ?? (d.preferredDate ? formatLegacyPreferredDate(d.preferredDate,d.preferredTimeNote) : null) : null
    return json({context, feedbackError:feedback.status === "rejected", decision:d, decisionError:decision.status === "rejected",
      decisionDisplay: d ? {label:getParentDecisionLabel(d.decision),reason:d.declineReason ? getParentDeclineReasonLabel(d.declineReason) : null,schedule} : null,
      showDecision: own.data.status === "completed" && own.data.has_current_registration_result === false,
      chips:context?.programType ? feedbackChipsForProgram(context.programType) : [],
      decisions:PARENT_DECISION_OPTIONS, reasons:PARENT_DECLINE_REASON_OPTIONS, days:PREFERRED_DAY_OPTIONS, timeModes:PREFERRED_TIME_MODE_OPTIONS})
  }
  const arrays = ["chip","preferredDays"], singles = ["privateNote","decision","declineReason","preferredStartTime","preferredEndTime","preferredTimeMode"]
  const form = new FormData()
  for (const [key,value] of Object.entries(body)) {
    if (arrays.includes(key) && Array.isArray(value) && value.length <= 7 && value.every(v=>typeof v === "string")) { value.forEach(v=>form.append(key,v)); continue }
    if (singles.includes(key) && typeof value === "string") { form.append(key,value); continue }
    return json({error:"invalid_input"},400)
  }
  const result = await submitParentExperienceWorkflow(id,userId,form,adapter,deps.revalidate)
  return json(result,result.status === "success" ? 200 : 409)
}
