import "server-only"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import {
  buildParentHomeHighlights,
  formatChildChipLabel,
  formatHomeScheduleLabel,
  selectReportLookupCandidates,
  selectUpcomingExperiences,
  type ParentHomeHighlight,
  type ParentHomeUpcoming
} from "@/features/classes/lib/parent-home"
import { dataAdapter } from "@/shared/lib/db"

/**
 * Parent Home 의 개인화 영역 데이터.
 *
 * ⚠️ 새 adapter method 를 만들지 않는다. 학부모 화면이 이미 쓰던 조회
 *    (내 신청 · 내 자녀 · 발행본 한 건 · 공개 수업 상세)를 그대로 다시 쓴다.
 *
 * ⚠️ 실패를 "없음" 으로 접지 않는다. 조회가 실패하면 그 영역을 아예 그리지
 *    않는다 — 홈에서 "리포트 없음" 같은 단정은 하지 않는다.
 */
export type ParentHomeSummary = {
  childChipLabel: string | null
  highlights: ParentHomeHighlight[]
  upcoming: ParentHomeUpcoming[]
}

const EMPTY_SUMMARY: ParentHomeSummary = {
  childChipLabel: null,
  highlights: [],
  upcoming: []
}

export const getParentHomeSummary = async (): Promise<ParentHomeSummary> => {
  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])

  if (applications.error) {
    // 신청을 못 읽었으면 개인화 영역 전체를 접는다. 빈 홈이 거짓말하는 홈보다 낫다.
    return {
      ...EMPTY_SUMMARY,
      childChipLabel: children.error ? null : formatChildChipLabel(children.data)
    }
  }

  const now = Date.now()
  const upcomingApplications = selectUpcomingExperiences(applications.data, now)
  const reportCandidates = selectReportLookupCandidates(applications.data)

  const [coverImageUrls, reportReadyIds] = await Promise.all([
    Promise.all(
      upcomingApplications.map(async (item) => {
        // 표지 이미지는 공개 수업 정보다. 못 읽으면 이미지 없이 그린다.
        const detail = await getPublicClassDetail(item.classId)
        return [item.id, detail.error ? null : detail.data?.coverImageUrl ?? null] as const
      })
    ),
    Promise.all(
      reportCandidates.map(async (item) => {
        try {
          // 세션 client 다. RLS 가 그대로 적용되고, 살아 있는 발행본만 돌아온다.
          const report = await dataAdapter.getPublishedExperienceReport(item.id)
          return report ? item.id : null
        } catch {
          return null
        }
      })
    )
  ])

  const coverImageUrlByExperienceId = new Map(coverImageUrls)
  const reportReadyExperienceIds = new Set(
    reportReadyIds.filter((value): value is string => value !== null)
  )

  const upcoming: ParentHomeUpcoming[] = upcomingApplications.flatMap((item) => {
    const scheduleLabel = formatHomeScheduleLabel(item.confirmedSlotAt)
    if (!scheduleLabel || !item.confirmedSlotAt) {
      // 한국 시간으로 읽히지 않는 값은 일정으로 보여주지 않는다.
      return []
    }

    return [
      {
        experienceId: item.id,
        classTitle: item.classTitle ?? "수업 정보 준비 중",
        academyName: item.academyName,
        scheduleLabel,
        startAt: item.confirmedSlotAt,
        href: `/record/${item.id}`,
        coverImageUrl: coverImageUrlByExperienceId.get(item.id) ?? null
      }
    ]
  })

  return {
    childChipLabel: children.error ? null : formatChildChipLabel(children.data),
    highlights: buildParentHomeHighlights(applications.data, reportReadyExperienceIds),
    upcoming
  }
}
