import "server-only"

import { cache } from "react"

import type { ParentDecisionSummary } from "@/features/decisions/lib/parent-decision"
import { getMyExperienceDetail } from "@/features/record/queries/get-my-experience-detail"
import { dataAdapter } from "@/shared/lib/db"

/**
 * 학부모가 지금 남겨 둔 생각.
 *
 * 세 가지를 구분한다. 조회 실패를 "선택 없음" 으로 접으면, 이미 고른 값이 있는데도
 * 화면이 아무것도 고르지 않은 것처럼 보이고 원래 값이 조용히 덮인다.
 */
export type MyParentDecisionResult =
  | { status: "not_found" }
  | { status: "ok"; decision: ParentDecisionSummary | null }
  | { status: "error"; message: string }

const LOAD_ERROR_MESSAGE = "선택 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."

const getMyCurrentParentDecisionCached = cache(
  async (experienceId: string): Promise<MyParentDecisionResult> => {
    // 소유 확인이 먼저다. 남의 신청은 존재 여부조차 알려주지 않는다.
    // DB RLS 도 막지만, 여기서 확인해야 "남의 것" 과 "내 것인데 선택 없음" 을 구분한다.
    const experience = await getMyExperienceDetail(experienceId)
    if (!experience) {
      return { status: "not_found" }
    }

    try {
      const decision = await dataAdapter.getCurrentParentDecision(experienceId)
      return { status: "ok", decision }
    } catch {
      return { status: "error", message: LOAD_ERROR_MESSAGE }
    }
  }
)

export const getMyCurrentParentDecision = async (experienceId: string) =>
  getMyCurrentParentDecisionCached(experienceId)
