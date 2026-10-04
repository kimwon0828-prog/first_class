import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { sendParentNotificationSafely } from "../alimtalk/send-parent-notification"
import type { ParentNotificationContext } from "../alimtalk/types"
import { confirmedPushEnabled, isConfirmedPushTestApplication } from "./confirmed-policy"
import { confirmedOutcome, readConfirmedReceipts, sendConfirmedPush, type ConfirmedAttempt } from "./confirmed-transport"

type Job = {
  id: string; notification_key: string; application_id: string; parent_id: string;
  state: string; attempts: ConfirmedAttempt[]; suppress_legacy: boolean; created_at: string;
}
const table = "parent_confirmed_push_deliveries"
const warn = () => console.warn("[confirmed-push] processing requires review; no automatic send retry")
async function claim(id: string, operation: "send" | "receipts" | "fallback") {
  const { data, error } = await getSupabaseServiceRoleClient().rpc("claim_confirmed_push", { p_id: id, p_operation: operation })
  if (error) throw new Error("confirmed_push_claim_failed")
  return data?.[0] as Job | undefined
}
async function save(job: Job, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseServiceRoleClient().from(table).update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("state", job.state).select("id")
  if (error || data?.length !== 1) throw new Error("confirmed_push_save_failed")
}
async function disableInvalid(job: Job, attempts: ConfirmedAttempt[]) {
  for (const a of attempts.filter(a => a.error === "DeviceNotRegistered")) {
    const { error } = await getSupabaseServiceRoleClient().from("parent_push_devices").update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("id", a.deviceId).eq("parent_id", job.parent_id).eq("expo_push_token", a.token)
    if (error) throw new Error("confirmed_push_disable_failed")
  }
}

async function fallbackContext(job: Job): Promise<ParentNotificationContext | null> {
  const db = getSupabaseServiceRoleClient()
  const { data: a, error } = await db.from("trial_applications")
    .select("id,parent_id,parent_name,parent_phone,child_name,class_id,status,requested_slot_at,confirmed_slot_at,selected_schedule_label,classes(title,organization_id,organizations(name))")
    .eq("id", job.application_id).eq("parent_id", job.parent_id).maybeSingle()
  if (error) throw new Error("confirmed_push_context_failed")
  if (!a || a.status !== "confirmed") return null
  const c = Array.isArray(a.classes) ? a.classes[0] : a.classes
  const o = c && (Array.isArray(c.organizations) ? c.organizations[0] : c.organizations)
  if (!c?.organization_id) return null
  return { eventType: "trial_schedule_confirmed", organizationId: c.organization_id, trialApplicationId: a.id,
    parentId: a.parent_id, parentPhone: a.parent_phone, parentName: a.parent_name, studentName: a.child_name,
    classId: a.class_id, classTitle: c.title, academyName: o?.name ?? null, requestedSlotAt: a.requested_slot_at,
    confirmedSlotAt: a.confirmed_slot_at, selectedScheduleLabel: a.selected_schedule_label }
}
async function runFallback(id: string) {
  const job = await claim(id, "fallback")
  if (!job) return
  if (job.suppress_legacy) { await save(job, { state: "test_suppressed", reason: "test_legacy_not_sent" }); return }
  const context = await fallbackContext(job)
  if (!context) { await save(job, { state: "canceled", reason: "source_no_longer_current" }); return }
  // Claim persists before the legacy provider call. A crash/ambiguous provider result is never auto-retried.
  const result = await sendParentNotificationSafely(context)
  const complete = result && (result.alimtalk.status === "sent" || ["sent", "dry_run", "skipped"].includes(result.fallbackStatus ?? ""))
  await save(job, { state: complete ? "fallback_done" : "unknown", reason: complete ? "legacy_attempted_once" : "legacy_requires_review" })
}

export async function dispatchConfirmedPush(id: string) {
  if (!confirmedPushEnabled()) return
  const job = await claim(id, "send")
  if (!job) return
  if (job.state === "fallback_ready") { await runFallback(id); return }
  // Recheck binding immediately before the external call (logout/rotation/account switch).
  const current = await getSupabaseServiceRoleClient().from("parent_push_devices").select("id,expo_push_token")
    .eq("parent_id", job.parent_id).eq("enabled", true).eq("permission_status", "granted")
  if (current.error) throw new Error("confirmed_push_devices_unavailable")
  const available = job.attempts.filter(a => current.data?.some(d => d.id === a.deviceId && d.expo_push_token === a.token))
  const skipped = job.attempts.filter(a => !available.includes(a)).map(a => ({ ...a, sendStatus: "rejected" as const, error: "device_unavailable" }))
  const attempts = [...skipped, ...await sendConfirmedPush(job.notification_key, available)]
  const state = confirmedOutcome(attempts)
  // Persist provider evidence before any secondary operation. Failure leaves 'sending', never resend.
  await save(job, { attempts, state, next_check_at: new Date(Date.now() + 60000).toISOString(), reason: state === "unknown" ? "send_requires_review" : null })
  await disableInvalid(job, attempts)
  if (state === "fallback_ready") await runFallback(id)
}

async function checkReceipts(id: string) {
  const job = await claim(id, "receipts")
  if (!job) return
  const attempts = await readConfirmedReceipts(job.attempts, Date.parse(job.created_at) < Date.now() - 24 * 3600000)
  const state = confirmedOutcome(attempts)
  await disableInvalid(job, attempts)
  await save(job, { attempts, state, next_check_at: new Date(Date.now() + 5 * 60000).toISOString(), reason: state === "unknown" ? "receipt_requires_review" : null })
  if (state === "fallback_ready") await runFallback(id)
}

/** Called only after the existing confirmation RPC committed. No other event is wired. */
export async function sendConfirmedApplicationSafely(context: ParentNotificationContext) {
  try {
    if (context.eventType !== "trial_schedule_confirmed") return
    if (!confirmedPushEnabled()) { await sendParentNotificationSafely(context); return }
    const { data, error } = await getSupabaseServiceRoleClient().from(table).select("id")
      .eq("application_id", context.trialApplicationId).eq("parent_id", context.parentId)
      .order("created_at", { ascending: false }).limit(1)
    if (error) throw new Error("confirmed_push_ledger_unavailable")
    if (data?.[0]) await dispatchConfirmedPush(data[0].id)
    else if (!await isConfirmedPushTestApplication(context.trialApplicationId, context.parentId)) await sendParentNotificationSafely(context)
  } catch { warn() }
}

export async function runConfirmedPushWork() {
  if (!confirmedPushEnabled()) return { enabled: false, processed: 0 }
  const { data, error } = await getSupabaseServiceRoleClient().from(table).select("id,state")
    .in("state", ["pending", "receipts", "checking", "fallback_ready"])
    .lte("next_check_at", new Date().toISOString()).order("next_check_at").limit(3)
  if (error) throw new Error("confirmed_push_work_unavailable")
  let errors = 0
  for (const row of data ?? []) {
    try {
      if (row.state === "pending") await dispatchConfirmedPush(row.id)
      else if (row.state === "fallback_ready") await runFallback(row.id)
      else await checkReceipts(row.id)
    } catch { errors++; warn() }
  }
  return { enabled: true, processed: data?.length ?? 0, errors }
}
