import "server-only"

import { dataAdapter } from "@/shared/lib/db"
import type { ExperienceReportSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

/**
 * 지금 부모에게 공개돼 있는 발행본.
 *
 * ⚠️ trial_results 를 다시 조립해서 "현재 발행본" 이라고 부르지 않는다.
 *    발행본은 발행 시점에 얼어붙은 snapshot 이고, 그 뒤 평가가 바뀌었을 수도 있다.
 *    둘을 섞으면 화면이 부모가 보고 있지 않은 내용을 "공개 중" 이라고 말하게 된다.
 *
 * RLS 가 조직 scope 를 판정한다. 여기서 다시 적지 않는다.
 */
export const getPublishedExperienceReport = async (
  applicationId: string
): Promise<QueryResult<ExperienceReportSummary | null>> => {
  try {
    const data = await dataAdapter.getPublishedExperienceReport(applicationId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      error: "발행된 리포트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
