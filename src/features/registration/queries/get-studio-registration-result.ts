import "server-only"

import type { RegistrationResultSummary } from "@/features/registration/lib/registration-result"
import { dataAdapter } from "@/shared/lib/db"
import type { QueryResult } from "@/shared/queries"

/**
 * 학원이 보는 지금의 등록 결과.
 *
 * RLS 가 조직 scope 를 판정한다 — 다른 조직 신청은 애초에 빈 결과다.
 * 읽기 전용이다. 이 경로로 결과를 쓰지 않는다. 결과는 registration_status 가
 * 바뀔 때 DB 가 같은 transaction 안에서 기록한다.
 */
export const getStudioRegistrationResult = async (
  applicationId: string
): Promise<QueryResult<RegistrationResultSummary | null>> => {
  try {
    const data = await dataAdapter.getCurrentRegistrationResult(applicationId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      // 조회 실패를 "결과 없음" 으로 접지 않는다. 확정된 등록이 화면에서
      // 조용히 사라지면 원장이 다시 상담을 돌리게 된다.
      error: "등록 결과를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
    }
  }
}
