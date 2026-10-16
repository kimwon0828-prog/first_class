import type { ClassProgramType } from "@/shared/lib/db/adapter"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"

/** The same eligibility rule used by Home and the application action; no age inference. */
export const selectEligibleDiscoveryClasses = <T extends { targetAge: string }>(
  classes: readonly T[], selectedChild: { grade: string } | null
): T[] => selectedChild
  ? classes.filter((item) => isChildEligibleForClass(selectedChild.grade, item.targetAge))
  : [...classes]

/**
 * Parent trial fee copy. Missing/invalid prices must never be interpreted as free.
 * 0원은 학원이 무료로 확인한 경우만 무료다. 확인 기록이 없으면(false) "가격 정보 확인 필요".
 * trialPriceConfirmed 가 null/undefined 이면 확인 컬럼이 없는 DB 라 기존 표시를 유지한다.
 */
export const formatDiscoveryPrice = ({ programType, trialPrice, trialPriceConfirmed }: {
  programType: ClassProgramType
  trialPrice: number | null | undefined
  trialPriceConfirmed?: boolean | null
}): string => {
  if (typeof trialPrice !== "number" || !Number.isFinite(trialPrice) || trialPrice < 0) {
    return "가격 정보 확인 필요"
  }
  if (trialPrice === 0 && trialPriceConfirmed === false) {
    return "가격 정보 확인 필요"
  }
  const programLabel = programType === "level_test" ? "레벨테스트" : "체험수업"
  return trialPrice === 0 ? `무료 ${programLabel}` : `${programLabel} ${trialPrice.toLocaleString("ko-KR")}원`
}
