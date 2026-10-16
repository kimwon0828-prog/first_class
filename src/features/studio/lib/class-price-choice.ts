// 기존 수업의 무료·유료 초기 선택. 양수는 유료, 학원이 확인한 0원(또는 확인 컬럼이 없는 DB의 0원)만 무료로 미리 고른다.
// 확인 기록 없는 0원은 비워 두어 학원이 다시 고르게 한다.
export const initialPriceMode = (item?: { trialPrice: number; trialPriceConfirmed?: boolean | null } | null): "" | "free" | "paid" =>
  !item ? "" : item.trialPrice > 0 ? "paid" : item.trialPriceConfirmed === false ? "" : "free"
