// 월간 구독 기간 계산.
//
// "30일" 이 아니라 달력 한 달이다. 그리고 결제일(anchor)이 밀리면 안 된다.
//
//   1/31 결제 → 2/28 → 3/31 → 4/30 → 5/31
//
// 단순히 "직전 종료일 + 1개월" 로 계산하면 2/28 에서 앵커가 28일로 굳어
// 이후 모든 달이 28일이 된다(drift). 그래서 기준일(anchorDay)을 따로 들고 다니며
// 매달 그 날짜로 되돌린다. 짧은 달에서는 그 달의 마지막 날로 줄인다.
//
// 기준 시간대는 Asia/Seoul 이다. 결제일은 한국 달력 개념이라 UTC 날짜로 계산하면
// 자정 근처 결제에서 하루가 밀린다. KST 는 DST 가 없어 고정 +9 로 다룰 수 있다.

/** Asia/Seoul 고정 오프셋. 서머타임이 없다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const toKst = (value: Date) => new Date(value.getTime() + KST_OFFSET_MS)
const fromKst = (utcMillisOfKstWallClock: number) =>
  new Date(utcMillisOfKstWallClock - KST_OFFSET_MS)

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

/** 이 결제일의 기준일(1~31). KST 날짜다. */
export const resolveBillingAnchorDay = (periodStart: Date): number => toKst(periodStart).getUTCDate()

/**
 * 기준일을 유지한 채 months 개월 뒤.
 *
 * 시:분:초 는 periodStart 의 KST 벽시계 시각을 그대로 쓴다. 날짜만 anchorDay 로 되돌린다.
 */
export const addBillingMonths = (periodStart: Date, anchorDay: number, months = 1): Date => {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error("invalid_billing_anchor_day")
  }

  const kst = toKst(periodStart)
  const year = kst.getUTCFullYear()
  const targetMonth = kst.getUTCMonth() + months
  // Date.UTC 가 연/월 넘침을 정규화해 준다.
  const normalized = new Date(Date.UTC(year, targetMonth, 1))
  const day = Math.min(
    anchorDay,
    daysInMonth(normalized.getUTCFullYear(), normalized.getUTCMonth())
  )

  return fromKst(
    Date.UTC(
      normalized.getUTCFullYear(),
      normalized.getUTCMonth(),
      day,
      kst.getUTCHours(),
      kst.getUTCMinutes(),
      kst.getUTCSeconds(),
      kst.getUTCMilliseconds()
    )
  )
}

export type BillingPeriod = {
  periodStart: string
  periodEnd: string
  anchorDay: number
}

/** 최초 결제로 시작하는 첫 기간. 결제 시각이 곧 기준일이다. */
export const buildInitialBillingPeriod = (paidAt: Date): BillingPeriod => {
  const anchorDay = resolveBillingAnchorDay(paidAt)

  return {
    periodStart: paidAt.toISOString(),
    periodEnd: addBillingMonths(paidAt, anchorDay).toISOString(),
    anchorDay
  }
}

/**
 * 갱신 기간. 새 기간은 직전 기간이 끝나는 시점에서 이어진다.
 *
 * anchorDay 를 모르면(과거 데이터) 직전 종료일의 날짜를 기준일로 삼는다 —
 * 그 시점부터는 더 이상 밀리지 않는다.
 */
export const buildRenewalBillingPeriod = (
  currentPeriodEnd: Date,
  anchorDay: number | null
): BillingPeriod => {
  const resolvedAnchor = anchorDay ?? resolveBillingAnchorDay(currentPeriodEnd)

  return {
    periodStart: currentPeriodEnd.toISOString(),
    periodEnd: addBillingMonths(currentPeriodEnd, resolvedAnchor).toISOString(),
    anchorDay: resolvedAnchor
  }
}
