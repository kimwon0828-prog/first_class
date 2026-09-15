import "server-only"

import {
  buildStudioConversionAnalytics,
  selectConversionCohort,
  type StudioConversionAnalytics
} from "@/features/studio/lib/studio-conversion-analytics"
import type { StudioResolvedDateRange } from "@/features/studio/lib/studio-date-range"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

/**
 * 체험 이후 전환 현황.
 *
 * 신청 목록은 이미 화면이 한 번 가져온 것을 그대로 받는다 — 같은 조회를 두 번
 * 하지 않는다. cohort 를 먼저 좁히고, 그 id 들로 세 표를 한 번씩만 읽는다.
 *
 * 조직 범위는 호출부가 아니라 RLS 가 판정한다. 다른 조직 신청은 applications
 * 단계에서 이미 없고, 세 표도 자기 조직만 준다.
 */
export const getStudioConversionAnalytics = async (
  applications: StudioApplicationSummary[],
  range: StudioResolvedDateRange
): Promise<QueryResult<StudioConversionAnalytics | null>> => {
  try {
    const cohort = selectConversionCohort(applications, range)
    const sources = await dataAdapter.listStudioConversionSources(cohort.map((item) => item.id))

    return {
      data: buildStudioConversionAnalytics(applications, range, {
        publishedReportExperienceIds: new Set(sources.publishedReportApplicationIds),
        parentDecisionByExperienceId: new Map(
          sources.parentDecisions.map((item) => [item.applicationId, item.decision])
        ),
        registrationResultByExperienceId: new Map(
          sources.registrationResults.map((item) => [item.applicationId, item.result])
        )
      }),
      error: null
    }
  } catch {
    // 조회 실패를 0 으로 접지 않는다. 0건과 "못 읽었다" 는 다른 사실이고,
    // 0 으로 보이면 원장은 이번 달에 아무 일도 없었다고 읽는다.
    return {
      data: null,
      error: "전환 현황을 불러오지 못했어요. 잠시 후 다시 확인해 주세요."
    }
  }
}
