"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { isParentAccountDeletionEnabled } from "../lib/parent-account-deletion-server"
import type { ParentDeletionResult } from "../lib/parent-account-deletion-workflow"
import { deleteParentAccountWithApple } from "../lib/delete-parent-account-with-apple"
import { beginAppleDeletionReauth, consumeAppleDeletionGrant } from "@/features/auth/lib/apple-deletion-grant-server"

export async function deleteMyParentAccountAction(_previous: ParentDeletionResult, formData: FormData): Promise<ParentDeletionResult> {
  if (!isParentAccountDeletionEnabled() || formData.get("confirmation") !== "delete") {
    return { status: "error", message: "현재 회원탈퇴를 진행할 수 없습니다. 잠시 후 다시 시도해 주세요." }
  }
  const client = await getSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { status: "error", message: "로그인 상태를 확인할 수 없어요. 다시 로그인해 주세요." }
  const appleRefreshToken = await consumeAppleDeletionGrant(user.id)
  const result = await deleteParentAccountWithApple(client, getSupabaseServiceRoleClient(), { appleRefreshToken })
  if (result.appleReauthRequired) await beginAppleDeletionReauth(user.id)
  if (result.status === "success") {
    try { await client.auth.signOut({ scope: "local" }) } catch { /* Auth may already have removed the session. */ }
    const store = await cookies()
    for (const cookie of store.getAll()) {
      if (/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)) store.delete(cookie.name)
    }
    store.set("parent-account-deleted", "1", { httpOnly: true, sameSite: "strict", path: "/account-deleted", maxAge: 120 })
    redirect("/account-deleted")
  }
  return result
}
