import type { ClassProgramType } from "@/shared/lib/db/adapter"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"

/** The same eligibility rule used by Home and the application action; no age inference. */
export const selectEligibleDiscoveryClasses = <T extends { targetAge: string }>(
  classes: readonly T[], selectedChild: { grade: string } | null
): T[] => selectedChild
  ? classes.filter((item) => isChildEligibleForClass(selectedChild.grade, item.targetAge))
  : [...classes]

/** Parent trial fee copy. Missing/invalid prices must never be interpreted as free. */
export const formatDiscoveryPrice = ({ programType, trialPrice }: {
  programType: ClassProgramType
  trialPrice: number | null | undefined
}): string => {
  if (typeof trialPrice !== "number" || !Number.isFinite(trialPrice) || trialPrice < 0) {
    return "가격 정보 확인 필요"
  }
  const programLabel = programType === "level_test" ? "레벨테스트" : "체험수업"
  return trialPrice === 0 ? `무료 ${programLabel}` : `${programLabel} ${trialPrice.toLocaleString("ko-KR")}원`
}
