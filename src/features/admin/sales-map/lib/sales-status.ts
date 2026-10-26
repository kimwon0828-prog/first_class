// 영업 지도의 상태 규칙. 서버(action · query)와 화면이 같이 쓴다. 학원 목록(prospects.ts)은 여기서 읽지 않는다.

export const SALES_STATES = ["미접촉", "연락함", "미팅", "확정", "거절"] as const

export type SalesState = (typeof SALES_STATES)[number]

export const SALES_MEMO_MAX_LENGTH = 500

/** 브랜드가 다른 확정 학원이 이만큼 모이면 그 과목 비딩을 연다. */
export const SALES_BIDDING_BRAND_TARGET = 3

/** 저장된 행이 없을 때의 기본 상태. 씨큐브(t12)는 이미 확정된 곳이다. */
const DEFAULT_STATE_BY_PROSPECT: Record<string, SalesState> = {
  t12: "확정"
}

export const isSalesState = (value: unknown): value is SalesState =>
  typeof value === "string" && (SALES_STATES as readonly string[]).includes(value)

export const resolveDefaultSalesState = (prospectId: string): SalesState =>
  DEFAULT_STATE_BY_PROSPECT[prospectId] ?? "미접촉"

export type SalesProspectStatus = {
  state: SalesState
  memo: string
  visitedOn: string | null
}

export type SalesProspectView = {
  id: string
  grade: "A" | "B" | "보완"
  type: "학원" | "교습소"
  subject: string
  ownership: "개인" | "프랜차이즈" | "미확인"
  name: string
  phone: string
  address: string
  elementaryShare: number | null
  note: string
  /** 같은 브랜드 지점끼리 같은 값. 브랜드가 없으면 학원 id. */
  brandKey: string
  status: SalesProspectStatus
}

export type SalesSubjectView = {
  key: string
  core: boolean
}

export type SalesStatusUpdateInput = {
  prospectId: string
  state?: SalesState
  memo?: string
}

export type SalesStatusUpdateResult = {
  prospectId: string
  status: SalesProspectStatus
}

export type SalesSubjectGauge = {
  confirmedBrands: number
  /** 거절을 뺀 나머지 브랜드 수(확정 포함). */
  openBrands: number
  verdict: "ready" | "short" | "progress"
}

export const resolveSubjectGauge = (rows: Array<Pick<SalesProspectView, "brandKey"> & { state: SalesState }>) => {
  const confirmed = new Set(rows.filter((row) => row.state === "확정").map((row) => row.brandKey))
  const open = new Set(rows.filter((row) => row.state !== "거절").map((row) => row.brandKey))
  const verdict: SalesSubjectGauge["verdict"] =
    confirmed.size >= SALES_BIDDING_BRAND_TARGET
      ? "ready"
      : open.size < SALES_BIDDING_BRAND_TARGET
        ? "short"
        : "progress"

  return {
    confirmedBrands: confirmed.size,
    openBrands: open.size,
    verdict
  } satisfies SalesSubjectGauge
}

/** 오늘 날짜(KST)를 YYYY-MM-DD 로. */
export const toKstDateKey = (date: Date) => new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
