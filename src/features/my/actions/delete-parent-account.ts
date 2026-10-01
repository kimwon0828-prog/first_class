"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { isParentAccountDeletionEnabled } from "../lib/parent-account-deletion-server"
import { deleteParentAccountWorkflow, type ParentDeletionResult } from "../lib/parent-account-deletion-workflow"

export async function deleteMyParentAccountAction(_previous: ParentDeletionResult, formData: FormData): Promise<ParentDeletionResult> {
  if (!isParentAccountDeletionEnabled() || formData.get("confirmation") !== "delete") {
    return { status: "error", message: "현재 회원탈퇴를 진행할 수 없습니다. 잠시 후 다시 시도해 주세요." }
  }
  const client = await getSupabaseServerClient()
  const result = await deleteParentAccountWorkflow(client, getSupabaseServiceRoleClient())
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
