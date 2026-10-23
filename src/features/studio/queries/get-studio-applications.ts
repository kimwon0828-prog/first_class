import { cache } from "react"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationListOptions, StudioApplicationSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioApplications = async (
  organizationId: string,
  options?: StudioApplicationListOptions
): Promise<QueryResult<StudioApplicationSummary[]>> => {
  try {
    const data = await dataAdapter.listStudioApplications(organizationId, options)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "신청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}

/**
 * 한 요청 안에서 사이드바 "홈" 건수(layout)와 홈 화면이 같은 조회 결과를 쓴다.
 * React cache 라 요청이 끝나면 버려진다. 조회 조건은 getStudioApplications 와 같다.
 */
export const getStudioApplicationsForDashboard = cache((organizationId: string) => getStudioApplications(organizationId))
