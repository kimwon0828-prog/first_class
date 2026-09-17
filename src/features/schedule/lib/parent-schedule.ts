import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { formatSeoulDateKey, getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/**
 * 학부모 일정의 단 하나의 규칙.
 *
 * ⚠️ "예정" 은 학원이 확정한 시각만이다. requestedSlotAt 은 학부모가 희망한
 *    시각이지 약속이 아니다. 그걸 일정으로 보여 주면 아무도 확정하지 않은
 *    시간에 아이를 데리고 가게 된다.
 *
 * Home 의 "다가오는 수업" 과 /my/schedule 이 같은 함수를 쓴다 — 두 화면이
 * 서로 다른 일정을 말하면 어느 쪽도 믿을 수 없다.
 */
export type ParentScheduleItem = {
  experienceId: string
  startAt: string
  /** 한국 시간 기준 날짜 키(YYYY-MM-DD). 같은 날끼리 묶는 데 쓴다. */
  dateKey: string
  childId: string | null
  childName: string
  childGrade: string
  classTitle: string | null
  academyName: string | null
  programType: ParentApplicationSummary["classProgramType"]
  href: string
}

const SEOUL_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const

const toTime = (value: string | null): number => {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/**
 * 이 신청이 "앞으로 있을 확정 일정" 인가.
 *
 *   confirmed 여야 하고, 확정 시각이 있어야 하고, 아직 지나지 않았어야 하고,
 *   취소되지도 완료되지도 않았어야 한다.
 */
export const isUpcomingConfirmedExperience = (
  item: ParentApplicationSummary,
  now: number
): boolean => {
  if (item.status !== "confirmed" || item.canceledAt || item.completedAt) {
    return false
  }

  const startAt = toTime(item.confirmedSlotAt)
  return Number.isFinite(startAt) && startAt >= now
}

/** 앞으로의 확정 일정만, 빠른 순으로. limit 을 주면 그만큼만 자른다. */
export const selectUpcomingConfirmedExperiences = (
  applications: readonly ParentApplicationSummary[],
  now: number,
  limit?: number
): ParentApplicationSummary[] => {
  const upcoming = applications
    .filter((item) => isUpcomingConfirmedExperience(item, now))
    .sort(
      (left, right) =>
        toTime(left.confirmedSlotAt) - toTime(right.confirmedSlotAt) ||
        left.id.localeCompare(right.id)
    )

  return typeof limit === "number" ? upcoming.slice(0, limit) : upcoming
}

/** 화면이 읽는 모양으로 바꾼다. 확정 시각이 한국 시간으로 읽히지 않으면 버린다. */
export const toParentScheduleItems = (
  applications: readonly ParentApplicationSummary[]
): ParentScheduleItem[] =>
  applications.flatMap((item) => {
    if (!item.confirmedSlotAt) {
      return []
    }

    const dateKey = formatSeoulDateKey(item.confirmedSlotAt)
    if (!dateKey) {
      return []
    }

    return [
      {
        experienceId: item.id,
        startAt: item.confirmedSlotAt,
        dateKey,
        childId: item.childId,
        childName: item.childName,
        childGrade: item.childGrade,
        classTitle: item.classTitle,
        academyName: item.academyName,
        programType: item.classProgramType,
        href: `/record/${item.id}`
      }
    ]
  })

export type ParentScheduleDayGroup = {
  dateKey: string
  /** "오늘" · "내일" · null. 날짜 라벨 앞에 붙는 보조 표현이다. */
  relativeLabel: string | null
  /** "9월 18일 금요일" */
  dateLabel: string
  items: ParentScheduleItem[]
}

/** "9월 18일 금요일" */
export const formatScheduleDateLabel = (value: string): string | null => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  return `${parts.month}월 ${parts.day}일 ${SEOUL_WEEKDAY_LABELS[parts.weekday]}요일`
}

/** "오후 3:00" */
export const formatScheduleTimeLabel = (value: string): string | null => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const meridiem = parts.hour < 12 ? "오전" : "오후"
  const rawHour = parts.hour % 12
  const hour = rawHour === 0 ? 12 : rawHour

  return `${meridiem} ${hour}:${String(parts.minute).padStart(2, "0")}`
}

/**
 * 오늘/내일은 날짜 키로만 판단한다.
 *
 * "24시간 이내" 같은 계산을 쓰지 않는다 — 오늘 밤 11시와 내일 새벽 1시는
 * 두 시간 차이지만 학부모에게는 다른 날이다.
 */
const relativeDayLabel = (dateKey: string, now: Date): string | null => {
  const todayKey = formatSeoulDateKey(now)
  if (dateKey === todayKey) {
    return "오늘"
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return dateKey === formatSeoulDateKey(tomorrow) ? "내일" : null
}

/** 날짜별로 묶는다. 주 경계 같은 것을 만들어내지 않는다. */
export const groupParentScheduleByDay = (
  items: readonly ParentScheduleItem[],
  now: Date
): ParentScheduleDayGroup[] => {
  const groups = new Map<string, ParentScheduleItem[]>()

  for (const item of items) {
    const current = groups.get(item.dateKey) ?? []
    current.push(item)
    groups.set(item.dateKey, current)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([dateKey, dayItems]) => {
      const dateLabel = formatScheduleDateLabel(dayItems[0].startAt)
      if (!dateLabel) {
        return []
      }

      return [
        {
          dateKey,
          relativeLabel: relativeDayLabel(dateKey, now),
          dateLabel,
          items: dayItems
        }
      ]
    })
}

/** 자녀 칩 라벨. 실제 children 데이터만 쓴다. */
export const formatScheduleChildLabel = (child: ChildProfile): string => {
  const grade = child.grade.trim()
  return grade ? `${child.name} · ${grade}` : child.name
}
