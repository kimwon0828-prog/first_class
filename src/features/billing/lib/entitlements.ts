// 학원이 지금 쓸 수 있는 기능의 canonical 정의.
//
// 화면과 action 은 요금제 이름을 비교하지 않는다. 항상 여기서 나온 flag 만 본다.
//   나쁨:  if (plan === "standard")
//   좋음:  if (!entitlements.canWriteConsultations)
//
// 누적 모델이다. STANDARD 는 FREE 전체를 포함하고, PRO 는 STANDARD 전체를 포함한다.
//
// 읽기와 쓰기를 나눈 것은 downgrade 때문이다. 유료를 쓰다 무료로 내려온 학원도
// 과거 체험 결과와 상담 이력은 계속 볼 수 있어야 한다.
// 그래서 열람 flag 는 과거 결제 이력을 조회해서 계산하지 않고 항상 참이다.

import type { OrganizationBillingSnapshot, OrganizationPlanCode } from "@/shared/lib/db/adapter"

export type StudioEntitlements = {
  // ── FREE: 입점 · 모객 · 체험 운영 ──────────────────────────
  canListOnMarketplace: boolean
  canManageAcademyProfile: boolean
  canManageClasses: boolean
  canManageSchedule: boolean
  canManageTeachers: boolean
  /** 신청 확인 · 일정 확정 · 취소 · 노쇼 · 체험 완료. 무료의 마지막 단계다. */
  canProcessTrial: boolean

  // ── 열람: downgrade 후에도 유지된다 ────────────────────────
  canViewTrialResults: boolean
  canViewConsultationHistory: boolean

  // ── STANDARD: 상담 · 등록 전환 ─────────────────────────────
  canWriteTrialResults: boolean
  /**
   * 상담 작성/수정.
   *
   * 등록 결과 · 정규수업 희망 일정 · 다음 연락 · 미등록 사유는 상담 저장과
   * 하나의 transaction(create_studio_consultation)이라 같은 flag 를 쓴다.
   * 별도 flag 로 쪼개면 transaction 을 다시 분해해야 한다.
   */
  canWriteConsultations: boolean
  canReopenConsultation: boolean
  canUseConversionAnalytics: boolean
  /** 노출 자격만 뜻한다. 정렬 로직은 아직 없다(MARKET-1). */
  hasMarketplaceRankingBoost: boolean

  // ── PRO: 현재 판매하지 않는다. 내부 전체 권한에서만 참이다. ──
  canUseAdvancedAnalytics: boolean
  canImportConsultations: boolean
  canUseAiConsultationTools: boolean
}

const FREE_ENTITLEMENTS: StudioEntitlements = {
  canListOnMarketplace: true,
  canManageAcademyProfile: true,
  canManageClasses: true,
  canManageSchedule: true,
  canManageTeachers: true,
  canProcessTrial: true,

  canViewTrialResults: true,
  canViewConsultationHistory: true,

  canWriteTrialResults: false,
  canWriteConsultations: false,
  canReopenConsultation: false,
  canUseConversionAnalytics: false,
  hasMarketplaceRankingBoost: false,

  canUseAdvancedAnalytics: false,
  canImportConsultations: false,
  canUseAiConsultationTools: false
}

const STANDARD_ENTITLEMENTS: StudioEntitlements = {
  ...FREE_ENTITLEMENTS,
  canWriteTrialResults: true,
  canWriteConsultations: true,
  canReopenConsultation: true,
  canUseConversionAnalytics: true,
  hasMarketplaceRankingBoost: true
}

const PRO_ENTITLEMENTS: StudioEntitlements = {
  ...STANDARD_ENTITLEMENTS,
  canUseAdvancedAnalytics: true,
  canImportConsultations: true,
  canUseAiConsultationTools: true
}

const ENTITLEMENTS_BY_PLAN: Record<OrganizationPlanCode, StudioEntitlements> = {
  free: FREE_ENTITLEMENTS,
  standard: STANDARD_ENTITLEMENTS,
  pro: PRO_ENTITLEMENTS
}

/** 내부 전체 권한. 향후 새 상업 entitlement 가 생겨도 자동으로 포함된다. */
export const FULL_ACCESS_ENTITLEMENTS: StudioEntitlements = PRO_ENTITLEMENTS

/** 조회 실패나 권한 없음의 기본값. 유료 기능은 전부 닫힌다. */
export const NO_PAID_ENTITLEMENTS: StudioEntitlements = FREE_ENTITLEMENTS

const toTimestamp = (value: string | null) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 이 구독이 지금 유료 기능을 열어 주는가.
 *
 *   trialing / active   연다.
 *   canceled / past_due 결제 기간이 아직 남아 있으면 그 끝까지 연다(paid-through).
 *   expired             열지 않는다.
 *
 * 기간을 알 수 없으면(둘 다 null) 열지 않는다 — 모르면 닫는다.
 */
const isSubscriptionEntitling = (
  subscription: NonNullable<OrganizationBillingSnapshot["subscription"]>,
  nowMs: number
) => {
  if (subscription.status === "trialing" || subscription.status === "active") {
    return true
  }

  if (subscription.status === "canceled" || subscription.status === "past_due") {
    const periodEnd = toTimestamp(subscription.currentPeriodEnd)
    return periodEnd != null && periodEnd > nowMs
  }

  return false
}

const isOverrideActive = (
  override: NonNullable<OrganizationBillingSnapshot["override"]>,
  nowMs: number
) => {
  if (!override.fullAccess) {
    return false
  }

  const expiresAt = toTimestamp(override.expiresAt)
  return expiresAt == null || expiresAt > nowMs
}

/** 요금제 사실만 본 결과. 내부 override 는 포함하지 않는다. */
export const resolveBilledPlanCode = (
  snapshot: OrganizationBillingSnapshot,
  now: Date = new Date()
): OrganizationPlanCode => {
  const subscription = snapshot.subscription
  if (!subscription || !isSubscriptionEntitling(subscription, now.getTime())) {
    return "free"
  }

  return subscription.planCode
}

export type ResolvedStudioEntitlements = {
  entitlements: StudioEntitlements
  /** 실제 결제 사실. override 가 있어도 이 값은 위조하지 않는다. */
  billedPlanCode: OrganizationPlanCode
  /** 내부 전체 권한으로 열린 상태인가. 관리자/개발 화면 표시에만 쓴다. */
  hasInternalFullAccess: boolean
}

/**
 * 요금제와 내부 override 를 합쳐 실제 사용 가능 기능을 만든다.
 *
 * override 가 살아 있으면 상업 기능을 전부 연다. 그래도 billedPlanCode 는
 * 결제 사실 그대로다 — 무료 조직을 "결제한 것처럼" 보이게 만들지 않는다.
 */
export const resolveStudioEntitlements = (
  snapshot: OrganizationBillingSnapshot,
  now: Date = new Date()
): ResolvedStudioEntitlements => {
  const billedPlanCode = resolveBilledPlanCode(snapshot, now)
  const hasInternalFullAccess = snapshot.override
    ? isOverrideActive(snapshot.override, now.getTime())
    : false

  return {
    entitlements: hasInternalFullAccess
      ? FULL_ACCESS_ENTITLEMENTS
      : ENTITLEMENTS_BY_PLAN[billedPlanCode],
    billedPlanCode,
    hasInternalFullAccess
  }
}
