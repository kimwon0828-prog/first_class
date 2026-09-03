// 확정된 체험의 진행 상태 파생.
//
// ⚠️ 시간은 "체험 완료" 를 만들지 않는다.
//   `체험 완료` 는 "원장이 체험이 끝났음을 확인하고 결과·등록 상담으로 넘겼다" 는 뜻이라
//   명시적 액션으로만 진입한다. 종료 시각이 지나도 화면은 계속 `체험 중` 이다.
//   따라서 schedule end != completed 다.
//
// 종료 시각은 배지를 바꾸지 않고 "다음 행동 문구" 에만 쓴다.
// DB status 는 건드리지 않는다 — 여기서 나오는 값은 오직 표시용이다.
//
// 종료 시각 source 우선순위는 이 파일만 안다. 화면들은 값만 넘긴다.
//
//   1순위  confirmed_schedule_block_id 가 가리키는 schedule_blocks.end_at
//          그 신청에 실제로 확정된 예약 구간이다. 예약 뒤 블록 시간이 조정돼도 정확하다.
//   2순위  confirmed_slot_at + class_schedules 의 정확한 수업 길이
//          블록 end_at 을 못 읽을 때만 쓴다. 길이는 studio-schedule-events 의
//          getScheduleDuration 을 그대로 쓰고, 그 함수의 60분 fallback 은 쓰지 않는다.
//   그 외  unknown. 추정하지 않는다.
//
// 시각 비교는 절대 시각(epoch ms)끼리 한다. confirmed_slot_at 은 timestamptz 이고
// duration 은 고정 분(minute)이라 종료 시각도 절대 시각이다. 따라서 실행 환경의
// 로컬 타임존과 무관하게 서울에서 본 결과와 항상 같다(달력 날짜 계산이 필요 없다).

import {
  getStudioDisplayStatus,
  type StudioDisplayStatus
} from "@/features/studio/lib/application-status-labels"
import { getScheduleDuration } from "@/features/studio/lib/studio-schedule-events"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

export type TrialScheduleWindow = {
  /** 시작 1순위. 확정된 예약 블록의 시작 시각(schedule_blocks.start_at). */
  confirmedBlockStartAt: string | null
  /** 종료 1순위. 확정된 예약 블록의 종료 시각(schedule_blocks.end_at). */
  confirmedBlockEndAt: string | null
  /** 2순위의 기준점. 없으면 길이를 알아도 종료 시각을 만들 수 없다. */
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
 * 확정 체험의 시작 시각(epoch ms).
 *
 *   1순위  confirmed_schedule_block_id 가 가리키는 schedule_blocks.start_at
 *          실제로 확정된 예약 구간이라 블록 시간이 조정돼도 정확하다.
 *   2순위  confirmed_slot_at
 *          DB constraint 상 확정 블록과 함께만 존재한다. 블록을 못 읽을 때의 fallback 이다.
 *   그 외  null. 추정하지 않는다.
 */
export const resolveTrialStartAtMs = (input: TrialScheduleWindow): number | null =>
  toTimestamp(input.confirmedBlockStartAt) ?? toTimestamp(input.confirmedSlotAt)

/** 확정 체험의 종료 시각(epoch ms). 위 우선순위로 찾고, 못 찾으면 null 이다. */
export const resolveTrialEndAtMs = (input: TrialScheduleWindow): number | null => {
  // 1순위 — 실제 확정된 예약 블록.
  const blockEndAt = toTimestamp(input.confirmedBlockEndAt)
  if (blockEndAt != null) {
    return blockEndAt
  }

  // 2순위 — 확정 시각 + 수업 길이.
  const startedAt = resolveTrialStartAtMs(input)
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
 * 확정 체험이 지금 어디까지 왔는가에 대한 단 하나의 판정.
 *
 *   unknown             시작 시각을 모른다. 추정하지 않는다.
 *   before_start        아직 시작 전이다.
 *   in_trial            시작했고 예정 종료 시각 전이다.
 *   after_scheduled_end 예정 종료 시각이 지났다. **여전히 체험 중이다** —
 *                       완료 여부는 원장만 안다. 다음 행동 문구에만 쓴다.
 *
 * 화면/단계 판정은 전부 이 함수 하나를 본다. 파일마다 다시 계산하지 않는다.
 */
export type TrialProgressState = "unknown" | "before_start" | "in_trial" | "after_scheduled_end"

export const getTrialProgressState = (
  input: TrialScheduleWindow,
  now: Date = new Date()
): TrialProgressState => {
  const startAt = resolveTrialStartAtMs(input)
  if (startAt == null) {
    return "unknown"
  }

  const nowMs = now.getTime()
  if (startAt > nowMs) {
    return "before_start"
  }

  const endAt = resolveTrialEndAtMs(input)
  // 종료 시각을 모르면 진행 중으로 둔다. 끝났다고 추정하지 않는다.
  if (endAt == null || endAt > nowMs) {
    return "in_trial"
  }

  return "after_scheduled_end"
}

/** 체험이 시작됐는가. 모르면 false — 추정하지 않는다. */
export const isTrialStarted = (input: TrialScheduleWindow, now: Date = new Date()): boolean => {
  const state = getTrialProgressState(input, now)
  return state === "in_trial" || state === "after_scheduled_end"
}

/**
 * 예정 종료 시각이 지났는가.
 *
 * ⚠️ 이 값으로 배지를 `체험 완료` 로 바꾸지 않는다. "완료 처리해 주세요" 문구에만 쓴다.
 */
export const isTrialScheduledEndPassed = (
  input: TrialScheduleWindow,
  now: Date = new Date()
): boolean => getTrialProgressState(input, now) === "after_scheduled_end"

/**
 * 배지에 쓸 표시 상태.
 *
 * confirmed 이고 체험이 시작됐으면 `in_trial` 이다. 예정 종료 시각이 지나도 그대로다 —
 * `completed` 는 실제 DB status 가 completed 일 때만 나온다.
 *
 * Cases / Case Detail / Dashboard / Schedule 이 전부 이 함수 하나를 쓴다.
 * 화면마다 다시 판정하면 같은 Case 가 화면마다 다른 배지를 갖게 된다.
 */
export const resolveTrialDisplayStatus = (
  input: { status: ApplicationStatus; noShowAt: string | null } & TrialScheduleWindow,
  now: Date = new Date()
): StudioDisplayStatus => {
  const base = getStudioDisplayStatus(input)
  if (base !== "confirmed") {
    return base
  }

  return isTrialStarted(input, now) ? "in_trial" : "confirmed"
}
