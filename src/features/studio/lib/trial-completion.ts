// 체험 종료 시각 파생.
//
// 확정된 체험이 끝났는지만 판정한다. DB status 는 건드리지 않는다 — 시간이 지났다는 이유로
// confirmed 를 completed 로 저장하지 않는다. 여기서 나오는 값은 오직 표시용이다.
//
// 종료 시각 = 확정 시각(confirmed_slot_at) + 수업 길이.
// 수업 길이는 studio-schedule-events 의 getScheduleDuration 을 그대로 쓴다.
// 새로 duration 을 추정하지 않는다 — 그 함수가 값을 모를 때 쓰는 60분 fallback 도 쓰지 않고,
// "종료 시각을 알 수 없음(null)" 으로 취급한다.
//
// 시각 비교는 절대 시각(epoch ms)끼리 한다. confirmed_slot_at 은 timestamptz 이고
// duration 은 고정 분(minute)이라 종료 시각도 절대 시각이다. 따라서 실행 환경의
// 로컬 타임존과 무관하게 서울에서 본 결과와 항상 같다(달력 날짜 계산이 필요 없다).

import { getScheduleDuration } from "@/features/studio/lib/studio-schedule-events"

export type TrialScheduleWindow = {
  /** 확정 시각. 없으면 종료 시각도 알 수 없다(희망 일정으로 대신 보지 않는다). */
  confirmedSlotAt: string | null
  scheduleStartTime: string | null
  scheduleEndTime: string | null
}

const MINUTE_MS = 60 * 1000

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 확정 체험의 종료 시각(epoch ms). 다음 중 하나라도 없으면 null 이다.
 *   - 확정 시각이 없다
 *   - class_schedules 의 start_time / end_time 을 못 읽는다(join 누락, legacy invalid)
 */
export const resolveTrialEndAtMs = (input: TrialScheduleWindow): number | null => {
  const startedAt = toTimestamp(input.confirmedSlotAt)
  if (startedAt == null) {
    return null
  }

  const duration = getScheduleDuration(input.scheduleStartTime, input.scheduleEndTime)
  if (duration.isDurationFallback) {
    // 길이를 모르는 것이다. 임의로 60분을 얹어 "끝났다" 고 말하지 않는다.
    return null
  }

  return startedAt + duration.durationMinutes * MINUTE_MS
}

/**
 * 확정 체험이 끝났는가에 대한 단 하나의 판정.
 *
 *   unknown     종료 시각을 모른다. 끝났는지 추정하지 않는다.
 *   before_end  아직 안 끝났다(시작 전 + 진행 중을 모두 포함한다).
 *   ended       종료 시각이 지났다.
 *
 * 화면/단계 판정은 전부 이 함수 하나를 본다. "끝났는가" 를 파일마다 다시 계산하지 않는다.
 */
export type TrialCompletionState = "unknown" | "before_end" | "ended"

export const getTrialCompletionState = (
  input: TrialScheduleWindow,
  now: Date = new Date()
): TrialCompletionState => {
  const endAt = resolveTrialEndAtMs(input)
  if (endAt == null) {
    return "unknown"
  }

  return endAt <= now.getTime() ? "ended" : "before_end"
}

/** 종료 시각이 지났는가. 모르면 false — 추정하지 않는다. */
export const isTrialTimeEnded = (input: TrialScheduleWindow, now: Date = new Date()): boolean =>
  getTrialCompletionState(input, now) === "ended"
