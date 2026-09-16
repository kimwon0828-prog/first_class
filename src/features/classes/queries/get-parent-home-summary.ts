import "server-only"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import {
  PARENT_ACTION_PREVIEW_LIMIT,
  type ParentAction
} from "@/features/actions/lib/parent-actions"
import { getParentActions } from "@/features/actions/queries/get-parent-actions"
import {
  formatChildChipLabel,
  formatHomeScheduleLabel,
  selectUpcomingExperiences,
  type ParentHomeUpcoming
} from "@/features/classes/lib/parent-home"

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
  /** Home 이 미리 보여 주는 Action. 전체는 /my/actions 가 맡는다. */
  actions: ParentAction[]
  /** 미리 보여 준 것 말고도 더 있는가. "전체 보기" 를 띄울지 정한다. */
  hasMoreActions: boolean
  upcoming: ParentHomeUpcoming[]
}

const EMPTY_SUMMARY: ParentHomeSummary = {
  childChipLabel: null,
  actions: [],
  hasMoreActions: false,
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

  /*
   * Action 판정은 Home 이 따로 하지 않는다.
   *
   * /my/actions 와 같은 selector 를 쓴다 — 두 화면이 서로 다른 "확인할 것" 을
   * 말하면 어느 쪽도 믿을 수 없다. Home 은 앞의 몇 개만 미리 보여 줄 뿐이다.
   */
  const [coverImageUrls, actionsResult] = await Promise.all([
    Promise.all(
      upcomingApplications.map(async (item) => {
        // 표지 이미지는 공개 수업 정보다. 못 읽으면 이미지 없이 그린다.
        const detail = await getPublicClassDetail(item.classId)
        return [item.id, detail.error ? null : detail.data?.coverImageUrl ?? null] as const
      })
    ),
    getParentActions()
  ])

  const coverImageUrlByExperienceId = new Map(coverImageUrls)
  // 조회가 실패했으면 Action 영역을 그리지 않는다. 없다고 단정하지 않는다.
  const allActions = actionsResult.error ? [] : actionsResult.actions

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
    actions: allActions.slice(0, PARENT_ACTION_PREVIEW_LIMIT),
    hasMoreActions: allActions.length > PARENT_ACTION_PREVIEW_LIMIT,
    upcoming
  }
}
