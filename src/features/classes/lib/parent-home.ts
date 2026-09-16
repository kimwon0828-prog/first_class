import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { selectUpcomingConfirmedExperiences } from "@/features/schedule/lib/parent-schedule"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/**
 * Parent Home 의 개인화 영역이 쓰는 순수 로직.
 *
 * ⚠️ 여기서 새 사실을 만들지 않는다. 이미 학부모 화면이 읽고 있던 값
 *    (신청 상태 · 확정 시각 · 발행본 존재 여부 · 자녀 프로필)만 다시 배열한다.
 *    일치율 · 추천 점수 · 랭킹처럼 근거 없는 지표는 이 파일이 만들지 않는다.
 */

/** 홈 "다가오는 수업 일정" 한 장. */
export type ParentHomeUpcoming = {
  experienceId: string
  classTitle: string
  academyName: string | null
  /** 한국 시간으로 읽은 확정 일정. 확정되지 않은 신청은 여기 오지 않는다. */
  scheduleLabel: string
  startAt: string
  href: string
  coverImageUrl: string | null
}

export const PARENT_HOME_UPCOMING_LIMIT = 2

const HOUR_LABELS = ["오전", "오후"] as const

/** "9월 15일 오후 1시" / 분이 있으면 "오후 1시 30분". */
export const formatHomeScheduleLabel = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const meridiem = parts.hour < 12 ? HOUR_LABELS[0] : HOUR_LABELS[1]
  const rawHour = parts.hour % 12
  const hour = rawHour === 0 ? 12 : rawHour
  const time = parts.minute > 0 ? `${hour}시 ${parts.minute}분` : `${hour}시`

  return `${parts.month}월 ${parts.day}일 ${meridiem} ${time}`
}

/**
 * 헤더의 아이 칩 문구.
 *
 * 아이가 여럿이면 한 명을 골라 대표로 쓰지 않는다 — 홈은 아이를 고르는
 * 화면이 아니고, 임의로 고른 이름은 그 아이의 화면이라는 잘못된 신호가 된다.
 */
export const formatChildChipLabel = (children: readonly ChildProfile[]): string | null => {
  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    const [child] = children
    const grade = child.grade.trim()
    return grade ? `${grade} ${child.name}` : child.name
  }

  return `우리 아이 ${children.length}명`
}

/**
 * Home 이 보여 줄 앞으로의 확정 일정.
 *
 * ⚠️ 판정 규칙을 여기서 다시 쓰지 않는다. /my/schedule 과 같은 함수를 쓴다 —
 *    두 화면이 서로 다른 일정을 말하면 어느 쪽도 믿을 수 없다.
 *    Home 은 몇 건만 보여 주므로 개수만 다르다.
 */
export const selectUpcomingExperiences = (
  applications: readonly ParentApplicationSummary[],
  now: number
): ParentApplicationSummary[] =>
  selectUpcomingConfirmedExperiences(applications, now, PARENT_HOME_UPCOMING_LIMIT)
