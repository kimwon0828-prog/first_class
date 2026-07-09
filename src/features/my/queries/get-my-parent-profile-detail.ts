import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { QueryResult } from "@/shared/queries"

export type MyParentProfileDetail = {
  id: string
  name: string
  phone: string | null
  parentBirthDate: string | null
}

export const getMyParentProfileDetail = async (): Promise<
  QueryResult<MyParentProfileDetail | null>
> => {
  const profile = await getMyProfile()

  if (!profile) {
    return {
      data: null,
      error: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요."
    }
  }

  if (profile.role !== "parent") {
    return {
      data: null,
      error: "학부모 계정만 보호자 정보를 조회할 수 있습니다."
    }
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, phone, parent_birth_date")
    .eq("id", profile.id)
    .maybeSingle()

  if (error || !data) {
    return {
      data: null,
      error: "보호자 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }

  return {
    data: {
      id: data.id,
      name: typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : profile.name,
      phone: typeof data.phone === "string" && data.phone.trim().length > 0 ? data.phone.trim() : null,
      parentBirthDate:
        typeof data.parent_birth_date === "string" && data.parent_birth_date.trim().length > 0
          ? data.parent_birth_date.trim()
          : null
    },
    error: null
  }
}
