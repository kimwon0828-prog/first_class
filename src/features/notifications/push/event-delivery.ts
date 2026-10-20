import { canSendApplicationNotification } from "../lib/app-store-review-recipient"
import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { sendParentNotificationSafely } from "../alimtalk/send-parent-notification"
import type { ParentNotificationContext } from "../alimtalk/types"
import { confirmedOutcome, readConfirmedReceipts, sendPushPayload, type ConfirmedAttempt } from "./confirmed-transport"
import { parentEventPayload, type ParentPushEvent } from "./event-payload"

export const parentEventPushEnabled = () => process.env.PARENT_EVENT_PUSH_ENABLED === "true"
type Job = { id: string; event_type: ParentPushEvent; notification_key: string; application_id: string; parent_id: string;
 state: string; attempts: ConfirmedAttempt[]; suppress_legacy: boolean; created_at: string }
const table = "parent_event_push_deliveries"
const warn = () => console.warn("[parent-event-push] processing requires review; no automatic send retry")
async function claim(id: string, operation: "send" | "receipts" | "fallback") {
 const { data, error } = await getSupabaseServiceRoleClient().rpc("claim_parent_event_push", { p_id: id, p_operation: operation })
 if (error) throw Error("event_push_claim_failed")
 return data?.[0] as Job | undefined
}
async function save(job: Job, values: Record<string, unknown>) {
 const { data, error } = await getSupabaseServiceRoleClient().from(table).update({ ...values, updated_at: new Date().toISOString() })
  .eq("id", job.id).eq("state", job.state).select("id")
 if (error || data?.length !== 1) throw Error("event_push_save_failed")
}
async function completeFeedback(job: Job) {
 if (job.event_type !== "feedback_reminder") return
 const { error } = await getSupabaseServiceRoleClient().rpc("complete_parent_push_feedback", { p_id: job.id })
 if (error) throw Error("push_feedback_completion_failed")
}
async function disableInvalid(job: Job, attempts: ConfirmedAttempt[]) {
 for (const attempt of attempts.filter(a => a.error === "DeviceNotRegistered")) {
  const { error } = await getSupabaseServiceRoleClient().from("parent_push_devices").update({ enabled: false, updated_at: new Date().toISOString() })
   .eq("id", attempt.deviceId).eq("parent_id", job.parent_id).eq("expo_push_token", attempt.token)
  if (error) throw Error("push_device_disable_failed")
 }
}
async function runFallback(id: string) {
 const job = await claim(id, "fallback")
 if (!job || !await canSendApplicationNotification(job.application_id)) return
 if (job.suppress_legacy) { await save(job, { state: "test_suppressed", reason: "test_legacy_not_sent" }); return }
 // Schedule changes have no existing Parent SMS/Alimtalk event. Do not invent one.
 if (job.event_type === "schedule_changed") { await save(job, { state: "no_device", reason: "push_unavailable_no_legacy_event" }); return }
 const db = getSupabaseServiceRoleClient()
 const { data: app, error } = await db.from("trial_applications").select("id,parent_id,parent_name,parent_phone,child_name,class_id,requested_slot_at,confirmed_slot_at,selected_schedule_label,classes(title,organization_id,organizations(name))")
  .eq("id", job.application_id).eq("parent_id", job.parent_id).maybeSingle()
 if (error) throw Error("push_fallback_context_failed")
 const klass = app && (Array.isArray(app.classes) ? app.classes[0] : app.classes)
 const org = klass && (Array.isArray(klass.organizations) ? klass.organizations[0] : klass.organizations)
 if (!app || !klass?.organization_id) { await save(job, { state: "canceled", reason: "source_missing" }); return }
 const sent = await sendParentNotificationSafely({ eventType: job.event_type === "report_published" ? "trial_report_published" : "trial_feedback_reminder",
  organizationId: klass.organization_id, trialApplicationId: app.id, parentId: app.parent_id, parentPhone: app.parent_phone, parentName: app.parent_name,
  studentName: app.child_name, classId: app.class_id, classTitle: klass.title, academyName: org?.name ?? null, requestedSlotAt: app.requested_slot_at,
  confirmedSlotAt: app.confirmed_slot_at, selectedScheduleLabel: app.selected_schedule_label,
  reportUrl: `https://firstsuup.com/record/${app.id}/report${job.event_type === "feedback_reminder" ? "#experience-feedback" : ""}` })
 const channel = sent?.alimtalk.status === "sent" ? "alimtalk" : sent?.fallbackStatus === "sent" ? "sms_fallback" : null
 // Dry-run/skipped is not evidence of actual delivery.
 await save(job, { state: channel ? "fallback_done" : "unknown", completion_channel: channel, reason: channel ? "legacy_sent_once" : "legacy_requires_review" })
 if (channel && job.event_type === "feedback_reminder") {
  await completeFeedback(job)
 }
}
export async function dispatchParentEventPush(id: string) {
 if (!parentEventPushEnabled()) return
 const job = await claim(id, "send")
 if (!job || !await canSendApplicationNotification(job.application_id)) return
 if (job.state === "fallback_ready") { await runFallback(id); return }
 const current = await getSupabaseServiceRoleClient().from("parent_push_devices").select("id,expo_push_token")
  .eq("parent_id", job.parent_id).eq("enabled", true).eq("permission_status", "granted")
 if (current.error) throw Error("event_push_devices_unavailable")
 const available = job.attempts.filter(a => current.data?.some(d => d.id === a.deviceId && d.expo_push_token === a.token))
 const skipped = job.attempts.filter(a => !available.includes(a)).map(a => ({ ...a, sendStatus: "rejected" as const, error: "device_unavailable" }))
 const attempts = [...skipped, ...await sendPushPayload(parentEventPayload(job.event_type, job.application_id, job.notification_key), available)]
 const state = confirmedOutcome(attempts)
 await save(job, { attempts, state, next_check_at: new Date(Date.now() + 60000).toISOString() })
 await disableInvalid(job, attempts)
 if (state === "fallback_ready") await runFallback(id)
}
async function checkReceipts(id: string) {
 const job = await claim(id, "receipts")
 if (!job || !await canSendApplicationNotification(job.application_id)) return
 const attempts = await readConfirmedReceipts(job.attempts, Date.parse(job.created_at) < Date.now() - 24 * 3600000)
 const state = confirmedOutcome(attempts)
 await save(job, { attempts, state, next_check_at: new Date(Date.now() + 5 * 60000).toISOString() })
 if (state === "delivered") await completeFeedback(job)
 await disableInvalid(job, attempts)
 if (state === "fallback_ready") await runFallback(id)
}
/** true means the durable queue owns delivery, including unknown results. Never fall through to SMS. */
export async function enqueueParentFeedbackPush(applicationId: string): Promise<boolean> {
 if (!parentEventPushEnabled()) return false
 const { data, error } = await getSupabaseServiceRoleClient().rpc("enqueue_parent_event_push", {
  p_event: "feedback_reminder", p_application_id: applicationId, p_source_id: applicationId, p_source_value: null
 })
 if (error) throw Error("feedback_push_enqueue_failed")
 if (!data) return false
 try { await dispatchParentEventPush(data); } catch { warn() }
 return true
}
export async function sendPublishedReportNotificationSafely(context: ParentNotificationContext) {
 if (!parentEventPushEnabled()) return sendParentNotificationSafely(context)
 try {
  const { data, error } = await getSupabaseServiceRoleClient().from(table).select("id").eq("application_id", context.trialApplicationId)
   .eq("parent_id", context.parentId).eq("event_type", "report_published").maybeSingle()
  if (error) throw Error("report_push_lookup_failed")
  if (!data) return sendParentNotificationSafely(context)
  await dispatchParentEventPush(data.id)
 } catch { warn() }
 return null
}
export async function runParentEventPushWork() {
 if (!parentEventPushEnabled()) return { enabled: false, processed: 0, errors: 0 }
 let errors = 0
 const pendingCompletion = await getSupabaseServiceRoleClient().from(table).select("id,event_type").eq("event_type", "feedback_reminder")
  .in("state", ["delivered", "fallback_done"]).eq("feedback_completed", false).limit(3)
 if (pendingCompletion.error) throw Error("event_push_completion_unavailable")
 for (const row of pendingCompletion.data ?? []) try { await completeFeedback(row as Job) } catch { errors++; warn() }
 const { data, error } = await getSupabaseServiceRoleClient().from(table).select("id,state")
  .in("state", ["pending", "receipts", "checking", "fallback_ready"]).lte("next_check_at", new Date().toISOString()).order("next_check_at").limit(3)
 if (error) throw Error("event_push_work_unavailable")
 for (const row of data ?? []) try {
  if (row.state === "pending") await dispatchParentEventPush(row.id)
  else if (row.state === "fallback_ready") await runFallback(row.id)
  else await checkReceipts(row.id)
 } catch { errors++; warn() }
 return { enabled: true, processed: data?.length ?? 0, errors }
}
