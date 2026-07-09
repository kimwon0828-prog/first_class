import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type ConflictReason = "existing_email_account" | "studio_account" | "account_check_failed"

type EmailConflictCheckResult =
  | {
      ok: true
      reason: null
    }
  | {
      ok: false
      reason: ConflictReason
    }

const STUDIO_PROFILE_ROLES = new Set(["teacher", "academy", "admin", "operator"])

const listUsersByEmail = async (email: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const normalizedEmail = email.trim().toLowerCase()
  const matchedUsers: Array<{ id: string; email: string | null }> = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await serviceRoleClient.auth.admin.listUsers({
      page,
      perPage
    })

    if (error) {
      throw error
    }

    const users = data.users ?? []
    for (const user of users) {
      const candidateEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : null
      if (candidateEmail === normalizedEmail) {
        matchedUsers.push({
          id: user.id,
          email: user.email ?? null
        })
      }
    }

    if (users.length < perPage) {
      break
    }

    page += 1
  }

  return matchedUsers
}

export const detectOAuthEmailConflict = async (
  currentUserId: string,
  email: string | null | undefined
): Promise<EmailConflictCheckResult> => {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

  if (!normalizedEmail) {
    return {
      ok: false,
      reason: "account_check_failed"
    }
  }

  try {
    const matchedUsers = await listUsersByEmail(normalizedEmail)
    const otherUsers = matchedUsers.filter((user) => user.id !== currentUserId)

    if (otherUsers.length === 0) {
      return {
        ok: true,
        reason: null
      }
    }

    const serviceRoleClient = getSupabaseServiceRoleClient()
    const { data: profiles, error: profilesError } = await serviceRoleClient
      .from("profiles")
      .select("id, role")
      .in(
        "id",
        otherUsers.map((user) => user.id)
      )

    if (profilesError) {
      throw profilesError
    }

    const hasStudioRoleConflict = (profiles ?? []).some((profile) => STUDIO_PROFILE_ROLES.has(String(profile.role)))

    return {
      ok: false,
      reason: hasStudioRoleConflict ? "studio_account" : "existing_email_account"
    }
  } catch {
    return {
      ok: false,
      reason: "account_check_failed"
    }
  }
}

export const resolveOAuthConflictMessage = (reason: ConflictReason) => {
  if (reason === "existing_email_account") {
    return "이미 이메일로 가입된 계정이 있습니다. 이메일로 로그인한 뒤 카카오 계정 연결을 진행해 주세요."
  }

  if (reason === "studio_account") {
    return "이 이메일은 학원 또는 선생님 계정으로 등록되어 있습니다. 스튜디오 로그인을 이용해 주세요."
  }

  return "계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요."
}
