// 학부모 지역 탐색 선택값. 행정지역 이름은 개인정보가 아니므로 URL query 로 다룬다.
// catalog 는 현재 입점 데이터에서 생성되며, URL 값은 catalog 로 반드시 재검증한다.

export const REGION_QUERY_KEYS = ["sido", "sigungu", "bname"] as const

export type RegionCatalogSigungu = {
  sigungu: string
  bnames: string[]
}

export type RegionCatalogSido = {
  sido: string
  sigungus: RegionCatalogSigungu[]
}

export type RegionCatalog = RegionCatalogSido[]

export type RegionSelection = {
  sido: string
  sigungu: string | null
  bname: string | null
}

export type RegionSelectionInput = {
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}

const toNullableText = (value: string | null | undefined) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim()
  return normalized || null
}

export const findCatalogSido = (catalog: RegionCatalog, sido: string | null) =>
  sido ? catalog.find((entry) => entry.sido === sido) ?? null : null

export const findCatalogSigungu = (
  sidoEntry: RegionCatalogSido | null,
  sigungu: string | null
) => (sidoEntry && sigungu ? sidoEntry.sigungus.find((entry) => entry.sigungu === sigungu) ?? null : null)

// 계층 규칙: sigungu 는 sido 를, bname 은 sido + sigungu 를 요구한다.
// 하위 단계가 catalog 에 없으면 상위 단계까지만 남긴다. 예외를 던지지 않는다.
export const canonicalizeRegionSelection = (
  catalog: RegionCatalog,
  input: RegionSelectionInput
): RegionSelection | null => {
  const sidoEntry = findCatalogSido(catalog, toNullableText(input.sido))
  if (!sidoEntry) {
    return null
  }

  const sigunguEntry = findCatalogSigungu(sidoEntry, toNullableText(input.sigungu))
  if (!sigunguEntry) {
    return { sido: sidoEntry.sido, sigungu: null, bname: null }
  }

  const bname = toNullableText(input.bname)
  const resolvedBname = bname && sigunguEntry.bnames.includes(bname) ? bname : null

  return {
    sido: sidoEntry.sido,
    sigungu: sigunguEntry.sigungu,
    bname: resolvedBname
  }
}

export const isSameRegionSelection = (
  left: RegionSelection | null,
  right: RegionSelectionInput | null
) =>
  (left?.sido ?? null) === toNullableText(right?.sido) &&
  (left?.sigungu ?? null) === toNullableText(right?.sigungu) &&
  (left?.bname ?? null) === toNullableText(right?.bname)

// filter pill 에는 마지막 선택 지역 중심의 짧은 label 만 노출한다.
export const formatRegionSelectionLabel = (selection: RegionSelection) => {
  if (selection.bname) {
    return `${selection.sigungu} · ${selection.bname}`
  }

  if (selection.sigungu) {
    return `${selection.sido} · ${selection.sigungu}`
  }

  return selection.sido
}
