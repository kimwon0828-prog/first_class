// 구독/결제 화면이 쓰는 표현 모델.
//
// 화면은 DB 값을 직접 해석하지 않는다. 여기서 나온 라벨과 flag 만 렌더한다.
// 순수 함수라 verifier 가 모든 상태를 DB 없이 돌린다.
//
// 지키는 것.
//   1. DB 상태 문자열(past_due 등)을 사용자에게 그대로 보여주지 않는다.
//   2. 결제 수단이 없는 구독에 "다음 결제일" 이라고 쓰지 않는다 — 자동 결제가 없다.
//   3. 내부 전체 권한을 "결제 중" 으로 표시하지 않는다. 결제 사실과 사용 가능 기능은 별개다.
//   4. 유예는 "3일" 이 아니라 실제 종료 시각을 보여준다.
//   5. 청구되지 않는 구독에 월 요금을 적지 않는다.

import type { ResolvedStudioEntitlements } from "@/features/billing/lib/entitlements"
import type { OrganizationSubscription } from "@/shared/lib/db/adapter"

/** Toss 공식 카드사 코드. 추정해서 채우지 않는다. */
export const TOSS_CARD_ISSUERS: Record<string, string> = {
  "11": "국민",
  "14": "신협",
  "15": "카카오뱅크",
  "21": "하나",
  "24": "토스뱅크",
  "30": "산업",
  "31": "BC",
  "32": "광주",
  "33": "우리",
  "34": "수협",
  "35": "전북",
  "36": "씨티",
  "37": "우체국",
  "38": "새마을",
  "39": "저축은행",
  "41": "신한",
  "42": "제주",
  "46": "광주",
  "51": "삼성",
  "52": "농협",
  "61": "현대",
  "62": "신협",
  "71": "롯데",
  "91": "농협",
  "3A": "케이뱅크",
  "3K": "기업비씨",
  W1: "우리"
}

/** 모르는 코드는 만들어 내지 않는다. 카드사 없이 번호만 보여준다. */
export const resolveCardIssuerName = (issuerCode: string | null): string | null =>
  issuerCode ? (TOSS_CARD_ISSUERS[issuerCode] ?? null) : null

export type BillingMethodDisplay = {
  issuerName: string | null
  maskedNumber: string | null
}

export type BillingBadgeTone = "green" | "blue" | "amber" | "gray"

export type BillingStatusBadge = {
  label: string
  tone: BillingBadgeTone
}

export type BillingDateRow = {
  /** "다음 결제일" 은 자동 결제가 실제로 예정된 경우에만 쓴다. */
  label: string
  value: string
}

export type BillingAlert = {
  tone: "amber"
  title: string
  body: string
}

export type BillingPresentation = {
  planLabel: string
  statusBadge: BillingStatusBadge
  /** 결제 사실 그대로. 내부 권한으로 위조하지 않는다. */
  billedPlanCode: "free" | "standard" | "pro"
  /** 내부 전체 권한으로 기능이 열려 있는가. 결제와 별개로 안내한다. */
  hasInternalFullAccess: boolean
  monthlyAmount: number | null
  dateRow: BillingDateRow | null
  alert: BillingAlert | null
  showStandardOffer: boolean
  canCancel: boolean
  canResume: boolean
  /** 유료인데 결제수단이 없다. 사람이 확인해야 하는 상태다. */
  billingMethodMissing: boolean
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const toKstParts = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Date(date.getTime() + KST_OFFSET_MS)
}

/** 2026년 10월 8일 */
export const formatBillingDate = (value: string | null): string | null => {
  const kst = value ? toKstParts(value) : null
  if (!kst) {
    return null
  }

  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`
}

/** 2026년 10월 11일 오후 4:00 — 유예 종료처럼 시각까지 중요한 경우에만 쓴다. */
export const formatBillingDateTime = (value: string | null): string | null => {
  const kst = value ? toKstParts(value) : null
  if (!kst) {
    return null
  }

  const hour24 = kst.getUTCHours()
  const meridiem = hour24 < 12 ? "오전" : "오후"
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12
  const minute = String(kst.getUTCMinutes()).padStart(2, "0")

  return `${formatBillingDate(value)} ${meridiem} ${hour}:${minute}`
}

const PLAN_LABEL: Record<string, string> = {
  free: "무료 플랜",
  standard: "스탠다드",
  pro: "프로"
}

export type BillingPresentationInput = {
  resolved: ResolvedStudioEntitlements
  subscription: OrganizationSubscription | null
  /** 활성 결제수단이 있는가. 자동 결제 예정 여부를 가르는 유일한 근거다. */
  hasActiveBillingMethod: boolean
  standardAmount: number
}

export const resolveBillingPresentation = (
  input: BillingPresentationInput
): BillingPresentation => {
  const { resolved, subscription, hasActiveBillingMethod, standardAmount } = input
  const billedPlanCode = resolved.billedPlanCode
  const base = {
    billedPlanCode,
    hasInternalFullAccess: resolved.hasInternalFullAccess,
    billingMethodMissing: false
  }

  // 결제 기준으로 무료다. 내부 권한이 있어도 결제 사실은 무료다.
  if (billedPlanCode === "free") {
    return {
      ...base,
      planLabel: PLAN_LABEL.free,
      statusBadge: { label: "무료", tone: "gray" },
      monthlyAmount: null,
      dateRow: null,
      alert: null,
      showStandardOffer: true,
      canCancel: false,
      canResume: false
    }
  }

  const planLabel = PLAN_LABEL[billedPlanCode] ?? PLAN_LABEL.standard
  // 월 요금은 실제로 청구되는 구독에만 쓴다. 수동으로 부여한 체험처럼 결제수단이 없는
  // 구독에 "월 요금 49,000원" 이라고 적으면 청구되고 있다고 오해하게 된다.
  const monthlyAmount =
    billedPlanCode === "standard" && hasActiveBillingMethod ? standardAmount : null
  const periodEnd = subscription?.currentPeriodEnd ?? null
  const status = subscription?.status ?? "active"

  // 갱신 실패. 유예가 끝나기 전에 해결해야 한다.
  if (status === "past_due") {
    const graceEnd = formatBillingDateTime(subscription?.gracePeriodEnd ?? null)
    return {
      ...base,
      planLabel,
      statusBadge: { label: "결제 확인 필요", tone: "amber" },
      monthlyAmount,
      dateRow: graceEnd ? { label: "이용 종료 예정일", value: graceEnd } : null,
      alert: {
        tone: "amber",
        title: "결제를 확인해 주세요",
        body: graceEnd
          ? `${graceEnd}까지는 스탠다드 기능을 그대로 이용할 수 있어요. 그때까지 결제가 확인되지 않으면 무료 플랜으로 전환돼요.`
          : "결제가 확인되지 않았어요. 결제수단을 확인해 주세요."
      },
      showStandardOffer: false,
      canCancel: false,
      canResume: false
    }
  }

  // 해지 예약. 기간까지는 그대로 쓴다.
  if (subscription?.cancelAtPeriodEnd) {
    const endDate = formatBillingDate(periodEnd)
    return {
      ...base,
      planLabel,
      statusBadge: { label: "해지 예정", tone: "amber" },
      monthlyAmount,
      dateRow: endDate ? { label: "이용 종료 예정일", value: endDate } : null,
      alert: {
        tone: "amber",
        title: "해지가 예약되어 있어요",
        body: endDate
          ? `${endDate}까지 스탠다드 기능을 이용할 수 있고, 이후 무료 플랜으로 전환돼요. 그전에 해지를 취소할 수 있어요.`
          : "해지가 예약되어 있어요. 그전에 해지를 취소할 수 있어요."
      },
      showStandardOffer: false,
      canCancel: false,
      canResume: true
    }
  }

  // 수동으로 부여한 체험. 자동 결제가 없으므로 "다음 결제일" 이라고 쓰지 않는다.
  if (status === "trialing") {
    const endDate = formatBillingDate(periodEnd)
    return {
      ...base,
      planLabel,
      statusBadge: { label: "체험 이용 중", tone: "blue" },
      monthlyAmount,
      dateRow: endDate ? { label: "이용 종료 예정일", value: endDate } : null,
      alert: null,
      showStandardOffer: false,
      canCancel: false,
      canResume: false
    }
  }

  // 정상 이용 중. 결제수단이 있어야 다음 결제가 예정된다.
  const nextDate = formatBillingDate(periodEnd)
  return {
    ...base,
    planLabel,
    statusBadge: { label: "이용 중", tone: "green" },
    monthlyAmount,
    billingMethodMissing: !hasActiveBillingMethod,
    dateRow: nextDate
      ? {
          label: hasActiveBillingMethod ? "다음 결제일" : "이용 종료 예정일",
          value: nextDate
        }
      : null,
    alert: hasActiveBillingMethod
      ? null
      : {
          tone: "amber",
          title: "결제 정보를 확인해 주세요",
          body: "등록된 결제수단이 없어 다음 결제가 예약되어 있지 않아요."
        },
    showStandardOffer: false,
    canCancel: hasActiveBillingMethod,
    canResume: false
  }
}

export type PaymentHistoryStatus = "succeeded" | "failed" | "canceled" | "refunded" | "pending"

const PAYMENT_STATUS_LABEL: Record<PaymentHistoryStatus, string> = {
  succeeded: "결제 완료",
  failed: "결제 실패",
  canceled: "결제 취소",
  refunded: "환불",
  pending: "확인 중"
}

export const formatPaymentStatus = (status: string): string =>
  PAYMENT_STATUS_LABEL[status as PaymentHistoryStatus] ?? "확인 중"

/** 원장에게 의미 있는 결과만 보여준다. 기술적 시도(pending)는 목록에 올리지 않는다. */
export const USER_VISIBLE_PAYMENT_STATUSES: PaymentHistoryStatus[] = [
  "succeeded",
  "failed",
  "canceled",
  "refunded"
]

export const formatBillingAmount = (amount: number): string =>
  `${new Intl.NumberFormat("ko-KR").format(amount)}원`
