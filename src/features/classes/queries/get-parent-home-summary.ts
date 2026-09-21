import "server-only"
import { settleHomeEnhancement, logHomeEnhancementFailure } from "../lib/home-enhancement"

import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import {
  resolveSelectedChildId,
  selectChildScopedItems,
  toChildSelectorOptions,
  type ChildSelectorOption
} from "@/features/children/lib/child-selection"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import {
  PARENT_ACTION_PREVIEW_LIMIT
} from "@/features/actions/lib/parent-actions"
import { getParentHomeActions } from "@/features/actions/queries/get-parent-home-actions"
import type { ParentHomeAction } from "@/features/actions/lib/parent-home-actions"
import type { ParentNotificationsResult } from "@/features/notifications/queries/get-parent-notifications"
import {
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
  /** 선택 UI 가 그릴 목록. 조회 실패면 빈 배열이고, selector 를 띄우지 않는다. */
  childrenError: boolean
  error: boolean
  childOptions: ChildSelectorOption[]
  /** 지금 보고 있는 아이. null 이면 전체다. */
  selectedChildId: string | null
  /** Home의 다음 행동 안내. Notifications 사건 이력과 별도로 판정한다. */
  actions: ParentHomeAction[]
  /** 미리 보여 준 것 말고도 더 있는가. "전체 보기" 를 띄울지 정한다. */
  hasMoreActions: boolean
  upcoming: ParentHomeUpcoming[]
}

export const EMPTY_SUMMARY: ParentHomeSummary = {
  childrenError: false,
  error: false,
  childOptions: [],
  selectedChildId: null,
  actions: [],
  hasMoreActions: false,
  upcoming: []
}

/**
 * @param requestedChildId 주소(?child=)에 적힌 아이. 내 아이가 아니면 무시된다.
 */
export const getParentHomeSummary = async (
  requestedChildId?: string | null,
  notifications: Promise<ParentNotificationsResult | null> = Promise.resolve(null)
): Promise<ParentHomeSummary> => {
  const [applications, children] = await Promise.all([
    settleHomeEnhancement("applications", getMyApplications, { data: [], error: "신청 정보를 불러오지 못했어요." }),
    settleHomeEnhancement("children", getMyChildren, { data: [], error: "자녀 정보를 불러오지 못했어요." })
  ])

  if (children.error) logHomeEnhancementFailure("children", new Error(children.error))
  const childOptions = children.error ? [] : toChildSelectorOptions(children.data)
  const selectedChildId = resolveSelectedChildId(requestedChildId, childOptions)

  if (applications.error) {
    logHomeEnhancementFailure("applications", new Error(applications.error))
    // 신청을 못 읽었으면 개인화 영역 전체를 접는다. 빈 홈이 거짓말하는 홈보다 낫다.
    return { ...EMPTY_SUMMARY, childOptions, selectedChildId, childrenError: Boolean(children.error), error: true }
  }

  const now = Date.now()
  /*
   * 아이를 고르면 그 아이의 것만 남긴다.
   *
   * ⚠️ 좁히는 것은 아이와 실제로 연결된 자리뿐이다 — 다가오는 일정과 확인할 것.
   *    Home 수업 목록의 신청 대상 판정은 호출부가 별도로 수행한다.
   *    child.grade / class.targetAge와 기존 신청 eligibility 함수를 재사용한다.
   */
  const scopedApplications = selectChildScopedItems(applications.data, selectedChildId)
  const upcomingApplications = selectUpcomingExperiences(scopedApplications, now)

  // Home next actions use read state and decision independently. Timeline helper remains separate.
  const [coverImageUrls, actionsResult] = await Promise.all([
    Promise.all(
      upcomingApplications.map(async (item) => {
        // 표지 이미지는 공개 수업 정보다. 못 읽으면 이미지 없이 그린다.
        const detail = await settleHomeEnhancement("schedule-cover", () => getPublicClassDetail(item.classId), { data: null, error: "표지 이미지를 불러오지 못했어요." })
        return [item.id, detail.error ? null : detail.data?.coverImageUrl ?? null] as const
      })
    ),
    getParentHomeActions(applications.data, notifications)
  ])

  const coverImageUrlByExperienceId = new Map(coverImageUrls)
  // 조회가 실패했으면 Action 영역을 그리지 않는다. 없다고 단정하지 않는다.
  const allActions = actionsResult.error
    ? []
    : selectChildScopedItems(actionsResult.actions, selectedChildId)

  const upcoming: ParentHomeUpcoming[] = upcomingApplications.flatMap((item) => {
    const scheduleLabel = formatHomeScheduleLabel(item.confirmedSlotAt)
    if (!scheduleLabel || !item.confirmedSlotAt) {
      // 한국 시간으로 읽히지 않는 값은 일정으로 보여주지 않는다.
      return []
    }

    return [
      {
        experienceId: item.id,
        childId: item.childId,
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
    childrenError: Boolean(children.error),
    error: Boolean(actionsResult.error),
    childOptions,
    selectedChildId,
    actions: allActions.slice(0, PARENT_ACTION_PREVIEW_LIMIT),
    hasMoreActions: allActions.length > PARENT_ACTION_PREVIEW_LIMIT,
    upcoming
  }
}
