import { dataAdapter } from "@/shared/lib/db"
import type { StudioTrialResultSaveContext } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

// 체험 결과 저장 전에만 쓰는 조회.
//
// getStudioApplicationDetail 은 학생/학부모, 활동 로그, actor 이름, 상담 이력까지
// 순차로 읽는다. 체험 결과 저장에는 status 와 기존 결과 값만 있으면 되므로
// 그 목적 전용으로 한 번만 읽는다. 기존 상세 조회의 의미는 그대로 둔다.
export const getStudioTrialResultSaveContext = async (
  applicationId: string,
  organizationId: string
): Promise<QueryResult<StudioTrialResultSaveContext | null>> => {
  try {
    const data = await dataAdapter.getStudioTrialResultSaveContext(applicationId, organizationId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      error: "신청 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
