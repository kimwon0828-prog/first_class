import "server-only"

import type { ParentDecisionSummary } from "@/features/decisions/lib/parent-decision"
import { dataAdapter } from "@/shared/lib/db"
import type { QueryResult } from "@/shared/queries"

/**
 * 학원이 보는 학부모의 현재 생각.
 *
 * RLS 가 조직 scope 를 판정한다 — 다른 조직 신청은 애초에 빈 결과다.
 * 읽기 전용이다. 학원이 이 값을 쓰는 경로는 만들지 않는다.
 */
export const getStudioParentDecision = async (
  applicationId: string
): Promise<QueryResult<ParentDecisionSummary | null>> => {
  try {
    const data = await dataAdapter.getCurrentParentDecision(applicationId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      // 조회 실패를 "선택 없음" 으로 접지 않는다. 화면이 구분해서 말한다.
      error: "학부모 선택을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
    }
  }
}
