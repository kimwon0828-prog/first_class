import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { dataAdapter } from "@/shared/lib/db"
import type { ChildProfile } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getMyChildren = async (): Promise<QueryResult<ChildProfile[]>> => {
  const profile = await getMyProfile()

  if (!profile) {
    return {
      data: [],
      error: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요."
    }
  }

  if (profile.role !== "parent") {
    return {
      data: [],
      error: "학부모 계정만 자녀 정보를 확인할 수 있습니다."
    }
  }

  try {
    const data = await dataAdapter.listMyChildren(profile.id)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "자녀 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
