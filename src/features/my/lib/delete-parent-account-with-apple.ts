import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { hasAppleIdentity } from "@/features/auth/lib/apple-auth"
import { appleRevocationConfigFromEnv, revokeAppleGrantForUser, type AppleRevocationConfig } from "@/features/auth/lib/apple-token-revocation"
import { deleteParentAccountWorkflow, type ParentDeletionResult } from "./parent-account-deletion-workflow"

type Options = { appleRefreshToken?: string; config?: AppleRevocationConfig | null; revoke?: typeof revokeAppleGrantForUser }
export async function deleteParentAccountWithApple(client: SupabaseClient, admin: SupabaseClient, options: Options = {}): Promise<ParentDeletionResult> {
  const failure = (message: string, appleReauthRequired = false): ParentDeletionResult => ({ status: "error", message, appleReauthRequired })
  try {
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return failure("로그인 상태를 확인할 수 없어요. 다시 로그인해 주세요.")
    if (hasAppleIdentity(user)) {
      // Authorize the first-party account before revoking any provider grant.
      // A pending marker permits recovery after the profile has been removed.
      const [profile, pending] = await Promise.all([
        client.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        client.rpc("get_my_parent_account_deletion_status")
      ])
      if (profile.error || pending.error || typeof pending.data !== "boolean" || (profile.data?.role !== "parent" && !pending.data)) {
        return failure("탈퇴할 학부모 계정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.")
      }
      const config = options.config === undefined ? appleRevocationConfigFromEnv() : options.config
      if (!config) return failure("Apple 계정 연결 해제를 준비 중입니다. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.")
      if (!options.appleRefreshToken) return failure("탈퇴를 계속하려면 같은 Apple 계정으로 본인 확인을 해 주세요.", true)
      const revoked = await (options.revoke ?? revokeAppleGrantForUser)(user, options.appleRefreshToken, { config })
      if (!revoked.ok && revoked.error === "apple_configuration_unavailable") return failure("Apple 계정 연결 해제를 준비 중입니다. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.")
      if (!revoked.ok) return failure("Apple 계정 연결을 해제하지 못했어요. 같은 Apple 계정으로 다시 본인 확인해 주세요.", true)
    }
    // The original DB/Storage/Auth cleanup and retry contract remain unchanged.
    return await deleteParentAccountWorkflow(client, admin, user.id)
  } catch {
    return failure("회원탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.")
  }
}
