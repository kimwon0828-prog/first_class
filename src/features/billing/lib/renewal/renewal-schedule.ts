// 갱신 시도 시점 규칙.
//
// Toss 는 구독 스케줄을 대신 돌려 주지 않는다("토스페이먼츠에서는 자체적으로 스케줄링
// 기능을 제공하지 않아요"). 우리가 Cron 으로 직접 승인 API 를 부른다.
//
// 시도 차수는 상태로 들고 다니지 않고 시각에서 계산한다. 저장하지 않으므로
// Cron 이 몇 번 돌든, 재시도되든 같은 시각에는 같은 차수가 나온다.
//
//   기간 종료 +0일  1차 시도
//   기간 종료 +1일  2차 시도
//   기간 종료 +2일  3차 시도
//   그 뒤            유예가 끝난다(BILLING-3A: 유예 = 기간 종료 + 3일)
//
// 유예는 실패해도 늘어나지 않는다. 그래서 재시도 창은 언제나 3일이다.

const DAY_MS = 24 * 60 * 60 * 1000

/** 유예 안에서 허용하는 최대 시도 차수(0부터). */
export const MAX_RENEWAL_ATTEMPT = 2

export type RenewalDecision =
  | { due: true; attemptNumber: number }
  | { due: false; reason: RenewalSkipReason }

export type RenewalSkipReason =
  | "not_due_yet"
  | "cancel_at_period_end"
  | "status_not_renewable"
  | "period_missing"
  | "grace_over"
  | "attempts_exhausted"

export type RenewalSubject = {
  subscriptionStatus: string
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/**
 * 지금 이 구독에 갱신 결제를 시도해야 하는가.
 *
 * 해지 예약(cancel_at_period_end)은 대상이 아니다 — 다음 결제를 부르지 않는 것이
 * 곧 해지 실행이다. 기간이 끝나면 lifecycle 정규화가 expired 로 내린다.
 */
export const decideRenewal = (subject: RenewalSubject, now: Date): RenewalDecision => {
  if (subject.cancelAtPeriodEnd) {
    return { due: false, reason: "cancel_at_period_end" }
  }

  // trialing 은 자동결제 대상이 아니다. 수동으로 넣은 PoC 구독이 여기에 해당한다.
  if (subject.subscriptionStatus !== "active" && subject.subscriptionStatus !== "past_due") {
    return { due: false, reason: "status_not_renewable" }
  }

  if (!subject.currentPeriodEnd) {
    return { due: false, reason: "period_missing" }
  }

  const periodEnd = new Date(subject.currentPeriodEnd).getTime()
  if (Number.isNaN(periodEnd)) {
    return { due: false, reason: "period_missing" }
  }

  const elapsed = now.getTime() - periodEnd
  if (elapsed < 0) {
    return { due: false, reason: "not_due_yet" }
  }

  // 이미 실패해 유예 중이라면, 유예가 끝난 뒤에는 더 시도하지 않는다.
  if (subject.subscriptionStatus === "past_due") {
    const graceEnd = subject.gracePeriodEnd ? new Date(subject.gracePeriodEnd).getTime() : NaN
    if (Number.isNaN(graceEnd) || graceEnd <= now.getTime()) {
      return { due: false, reason: "grace_over" }
    }
  }

  const attemptNumber = Math.floor(elapsed / DAY_MS)
  if (attemptNumber > MAX_RENEWAL_ATTEMPT) {
    return { due: false, reason: "attempts_exhausted" }
  }

  return { due: true, attemptNumber }
}
