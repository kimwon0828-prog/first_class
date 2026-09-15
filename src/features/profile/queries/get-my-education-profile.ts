import "server-only"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import {
  buildEducationProfile,
  type EducationProfile
} from "@/features/profile/lib/education-profile"
import { resolveParentExperienceDate } from "@/features/record/lib/experience-view"
import { dataAdapter } from "@/shared/lib/db"

/**
 * 한 아이의 교육 프로필.
 *
 * 4-state 가 아니라 3-state 다.
 *   not_found — 내 아이가 아니거나 없는 아이
 *   error     — 불러오지 못함
 *   ok        — 프로필(관찰이 0건이어도 ok 다)
 *
 * ⚠️ 관찰 0건은 오류가 아니다. 아직 발행된 리포트가 없다는 사실이고,
 *    화면은 그걸 그대로 말한다 — 빈 상태를 실패처럼 다루지 않는다.
 */
export type EducationProfileResult =
  | { state: "not_found" }
  | { state: "error"; message: string }
  | { state: "ok"; profile: EducationProfile }

export const getMyEducationProfile = async (
  childId: string
): Promise<EducationProfileResult> => {
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    // 남의 아이인지 없는 아이인지 구분해 주지 않는다. 존재 여부 자체가
    // 알려 줄 필요 없는 정보다.
    return { state: "not_found" }
  }

  let children
  try {
    children = await dataAdapter.listMyChildren(profile.id)
  } catch {
    return {
      state: "error",
      message: "교육 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }

  // 소유권 판정은 여기서 끝난다. 호출자가 넘긴 childId 를 그대로 쓰지 않고,
  // 내 아이 목록 안에 있는지부터 본다.
  const child = children.find((item) => item.id === childId) ?? null
  if (!child) {
    return { state: "not_found" }
  }

  try {
    const reports = await dataAdapter.listMyPublishedReportsByChild(child.id)

    return {
      state: "ok",
      profile: buildEducationProfile({
        childId: child.id,
        childName: child.name,
        reports: reports.map((report) => ({
          experienceId: report.experienceId,
          reportId: report.reportId,
          reportVersion: report.reportVersion,
          content: report.content,
          // 날짜 규칙을 새로 만들지 않는다. Record 상세와 같은 resolver 를 쓴다.
          experienceDate: resolveParentExperienceDate({
            confirmedSlotAt: report.confirmedSlotAt,
            requestedSlotAt: report.requestedSlotAt,
            completedAt: report.completedAt,
            canceledAt: report.canceledAt,
            createdAt: report.createdAt
          })
        }))
      })
    }
  } catch {
    // 조회 실패를 "관찰 없음" 으로 접지 않는다. 쌓인 기록이 조용히 사라진 것처럼
    // 보이면 부모는 리포트가 취소된 줄 안다.
    return {
      state: "error",
      message: "교육 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
