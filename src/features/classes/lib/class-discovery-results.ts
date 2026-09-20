import { isChildEligibleForClass } from "@/shared/constants/grade-options"

/** The same eligibility rule used by Home and the application action; no age inference. */
export const selectEligibleDiscoveryClasses = <T extends { targetAge: string }>(
  classes: readonly T[], selectedChild: { grade: string } | null
): T[] => selectedChild
  ? classes.filter((item) => isChildEligibleForClass(selectedChild.grade, item.targetAge))
  : [...classes]

export const formatDiscoveryPrice = (price: number | null | undefined): string =>
  typeof price !== "number" || !Number.isFinite(price) || price < 0
    ? "가격 정보 확인 필요"
    : price === 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`
