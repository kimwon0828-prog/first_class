import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { dataAdapter } from "@/shared/lib/db"
import type { MyDashboardData } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const emptyDashboard: MyDashboardData = {
  childrenCount: 0,
  totalApplicationCount: 0,
  newApplicationCount: 0,
  reviewingApplicationCount: 0,
  confirmedApplicationCount: 0,
  completedApplicationCount: 0,
  canceledApplicationCount: 0,
  recentApplications: []
}

export const getMyDashboard = async (): Promise<QueryResult<MyDashboardData>> => {
  const profile = await getMyProfile()

  if (!profile) {
    return {
      data: emptyDashboard,
      error: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요."
    }
  }

  if (profile.role !== "parent") {
    return {
      data: emptyDashboard,
      error: "학부모 계정만 마이페이지를 사용할 수 있습니다."
    }
  }

  try {
    const data = await dataAdapter.getMyDashboard(profile.id)
    return { data, error: null }
  } catch {
    return {
      data: emptyDashboard,
      error: "마이페이지 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
