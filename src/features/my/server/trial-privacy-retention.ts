import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type TrialPrivacyRetentionResult = Awaited<ReturnType<typeof runTrialPrivacyRetention>>

type FileTask = { bucket_id: string; object_name: string }
type Claim = { applicationId: string; leaseId: string; files: FileTask[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
function claimValue(value: unknown): Claim | null {
  if (value === null) return null
  if (!isRecord(value) || typeof value.applicationId !== "string" || !uuid.test(value.applicationId)
    || typeof value.leaseId !== "string" || !uuid.test(value.leaseId) || !Array.isArray(value.files)
    || value.files.length < 1 || value.files.length > 100) throw new Error("privacy_invalid_claim")
  const files: FileTask[] = []
  const seen = new Set<string>()
  for (const item of value.files) {
    if (!isRecord(item) || typeof item.bucket_id !== "string" || !item.bucket_id
      || typeof item.object_name !== "string" || !item.object_name) throw new Error("privacy_invalid_claim")
    const key = JSON.stringify([item.bucket_id, item.object_name])
    if (seen.has(key)) throw new Error("privacy_invalid_claim")
    seen.add(key)
    files.push({ bucket_id: item.bucket_id, object_name: item.object_name })
  }
  return { applicationId: value.applicationId, leaseId: value.leaseId, files }
}

/** DB-scoped, bounded work. Defaults OFF; never deletes an account or active child profile. */
export async function runTrialPrivacyRetention(options: {
  enabled?: boolean; client?: SupabaseClient; now?: () => number
} = {}) {
  const result = { enabled: options.enabled ?? process.env.TRIAL_PRIVACY_RETENTION_ENABLED === "true",
    scopes: 0, prepared: 0, blocked: 0, needsReview: 0, filesRemoved: 0, jobsCompleted: 0, errors: 0, busyScopes: 0, capacityReached: false, deadlineReached: false }
  if (!result.enabled) return result
  const client = options.client ?? getSupabaseServiceRoleClient()
  const now = options.now ?? Date.now
  const deadline = now() + 45000
  const inBudget = () => {
    if (now() < deadline) return true
    result.deadlineReached = true
    return false
  }
  const scopes = await client.rpc("list_trial_privacy_execution_scopes")
  if (scopes.error || !Array.isArray(scopes.data) || scopes.data.length > 10
    || scopes.data.some(row => !row || typeof row.organization_id !== "string" || !uuid.test(row.organization_id))) {
    throw new Error("privacy_scopes_unavailable")
  }
  for (const row of scopes.data) {
    if (!inBudget()) break
    const org = row.organization_id as string
    result.scopes++
    try {
      const prepared = await client.rpc("prepare_trial_privacy_retention_batch", { p_org: org, p_limit: 10 })
      if (prepared.error || !isRecord(prepared.data) || !integer(prepared.data.prepared)
        || !integer(prepared.data.blocked) || !integer(prepared.data.needsReview) || prepared.data.prepared + prepared.data.blocked > 10
        || typeof prepared.data.busy !== "boolean") throw new Error("privacy_prepare_failed")
      result.prepared += prepared.data.prepared
      result.blocked += prepared.data.blocked
      result.needsReview += prepared.data.needsReview
      if (prepared.data.busy) { result.busyScopes++; continue }
      if (prepared.data.prepared + prepared.data.blocked === 10) result.capacityReached = true
      for (let batch = 0; batch < 4 && inBudget(); batch++) {
        const claimed = await client.rpc("claim_trial_privacy_retention_files", { p_org: org })
        if (claimed.error) throw new Error("privacy_claim_failed")
        const claim = claimValue(claimed.data)
        if (!claim) break
        if (batch === 3) result.capacityReached = true
        try {
          const groups = new Map<string, string[]>()
          for (const file of claim.files) groups.set(file.bucket_id, [...(groups.get(file.bucket_id) ?? []), file.object_name])
          for (const [bucket, paths] of groups) {
            const removed = await client.storage.from(bucket).remove(paths)
            if (removed.error) throw new Error("privacy_storage_retry")
          }
          // One acknowledgement for the entire lease, after every bucket succeeds.
          // SQL checks exact scope, live lease and absent Storage metadata.
          const ack = await client.rpc("ack_trial_privacy_retention_files", {
            p_org: org, p_id: claim.applicationId, p_lease: claim.leaseId, p_objects: claim.files
          })
          if (ack.error || typeof ack.data !== "boolean") throw new Error("privacy_ack_failed")
          result.filesRemoved += claim.files.length
          if (ack.data) result.jobsCompleted++
        } catch {
          result.errors++
          // If this fails too, the DB lease expires; the queue is never marked done.
          try { await client.rpc("release_trial_privacy_retention_lease", { p_org: org, p_id: claim.applicationId, p_lease: claim.leaseId }) } catch { /* lease expiry permits recovery */ }
        }
      }
    } catch { result.errors++ }
  }
  return result
}
