import type { SupabaseClient } from "@supabase/supabase-js"

export type ParentDeletionResult = {
  status: "idle" | "error" | "success"
  message: string
  cleanupStarted?: boolean
}
const failure = (cleanupStarted = false): ParentDeletionResult => ({
  status: "error", cleanupStarted,
  message: "회원탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
})

// The authenticated RPC has no target ID. The admin path only receives the UID
// verified by Auth in this request, never a form field or unverified claim.
export async function deleteParentAccountWorkflow(userClient: SupabaseClient, admin: SupabaseClient): Promise<ParentDeletionResult> {
  let cleanupStarted = false
  try {
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return failure()
    const prepared = await userClient.rpc("prepare_my_parent_account_deletion")
    if (prepared.error || prepared.data !== "db_cleaned") return failure()
    cleanupStarted = true
    const objects = await userClient.rpc("get_my_parent_deletion_storage_objects")
    if (objects.error) return failure(true)
    const groups = new Map<string, string[]>()
    for (const row of (objects.data ?? []) as { bucket_id: string; object_name: string }[]) {
      groups.set(row.bucket_id, [...(groups.get(row.bucket_id) ?? []), row.object_name])
    }
    for (const [bucket, paths] of groups) {
      for (let i = 0; i < paths.length; i += 100) {
        const removed = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
        if (removed.error) return failure(true)
      }
    }
    const deleted = await admin.auth.admin.deleteUser(user.id)
    if (deleted.error && deleted.error.code !== "user_not_found" && deleted.error.status !== 404) return failure(true)
    // Auth removal cascades the temporary retry marker too. Concurrent callers
    // which already prepared may safely observe user_not_found here.
    return { status: "success", message: "회원탈퇴가 완료되었습니다.", cleanupStarted: true }
  } catch {
    return failure(cleanupStarted)
  }
}
