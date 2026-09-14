import "server-only"

import { cache } from "react"

import type { ParentExperience } from "@/features/record/lib/experience-view"
import { getMyExperienceDetail } from "@/features/record/queries/get-my-experience-detail"
import { dataAdapter } from "@/shared/lib/db"
import type { ExperienceReportSummary } from "@/shared/lib/db/adapter"

/**
 * 학부모가 지금 볼 수 있는 체험 리포트.
 *
 * 네 가지 결과를 구분한다. 셋을 하나로 접으면 화면이 거짓말을 하게 된다.
 *
 *   not_found   — 내 경험이 아니다. 존재 여부조차 알려주지 않는다.
 *   unavailable — 내 경험은 맞는데 지금 공개된 리포트가 없다(미발행 · 철회 · 이전 버전만 남음).
 *   error       — 조회 자체가 실패했다. "없음" 이 아니다(R2.1 에서 같은 실수를 했다).
 *   ok          — 지금 공개 중인 발행본이 있다.
 */
export type ParentExperienceReportResult =
  | { status: "not_found" }
  | { status: "unavailable"; experience: ParentExperience }
  | { status: "error"; experience: ParentExperience; message: string }
  | { status: "ok"; experience: ParentExperience; report: ExperienceReportSummary }

const REPORT_LOAD_ERROR_MESSAGE = "리포트 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."

const getMyExperienceReportCached = cache(
  async (experienceId: string): Promise<ParentExperienceReportResult> => {
    /*
     * 소유 확인이 먼저다.
     *
     * DB 쪽 RLS(status='published' AND parent_id = auth.uid())가 이미 막지만,
     * 여기서 한 번 더 확인하는 이유는 두 가지다.
     *   1. 남의 경험과 "내 경험인데 리포트가 없음" 을 구분해야 한다.
     *      RLS 만 쓰면 둘 다 빈 결과라 구분할 수 없고, 화면이 남의 경험에도
     *      "리포트가 없습니다" 라고 답해 존재 여부를 흘리게 된다.
     *   2. 조회 경로가 늘어나도 소유 판정이 한 곳에 남는다.
     *
     * getMyExperienceDetail 은 학부모 본인 목록에서만 찾으므로 남의 id 는 여기서 끝난다.
     */
    const experience = await getMyExperienceDetail(experienceId)
    if (!experience) {
      return { status: "not_found" }
    }

    try {
      // service role 이 아니라 세션 클라이언트다. RLS 가 그대로 적용된다.
      const report = await dataAdapter.getPublishedExperienceReport(experienceId)
      if (!report) {
        return { status: "unavailable", experience }
      }

      return { status: "ok", experience, report }
    } catch {
      // ⚠️ 실패를 "리포트 없음" 으로 접지 않는다.
      return { status: "error", experience, message: REPORT_LOAD_ERROR_MESSAGE }
    }
  }
)

export const getMyExperienceReport = async (experienceId: string) =>
  getMyExperienceReportCached(experienceId)
