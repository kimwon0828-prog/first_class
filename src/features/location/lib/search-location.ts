// 학부모 위치 탐색 기준값. DB 에 저장하지 않고 session cookie 로만 유지한다.
// 이 모듈은 순수 로직이므로 server/client 양쪽에서 import 할 수 있다.

export const SEARCH_LOCATION_COOKIE_NAME = "firstsuup_parent_search_location"

export const SEARCH_RADIUS_OPTIONS = [1, 3, 5, 10] as const
export type SearchRadiusKm = (typeof SEARCH_RADIUS_OPTIONS)[number]
export const DEFAULT_SEARCH_RADIUS_KM: SearchRadiusKm = 3

export const SEARCH_LOCATION_LABEL_MAX_LENGTH = 40

export type ParentSearchLocationSource = "current" | "address"

export type ParentSearchLocation = {
  v: 1
  lat: number
  lng: number
  label: string
  source: ParentSearchLocationSource
}

export const isSearchRadiusKm = (value: number): value is SearchRadiusKm =>
  (SEARCH_RADIUS_OPTIONS as readonly number[]).includes(value)

export const normalizeSearchRadiusKm = (value: string | number | null | undefined): SearchRadiusKm => {
  const parsed = typeof value === "number" ? value : Number.parseFloat((value ?? "").trim())
  if (Number.isFinite(parsed) && isSearchRadiusKm(parsed)) {
    return parsed
  }

  return DEFAULT_SEARCH_RADIUS_KM
}

export const nextWiderSearchRadiusKm = (value: SearchRadiusKm): SearchRadiusKm | null =>
  SEARCH_RADIUS_OPTIONS.find((option) => option > value) ?? null

// 약 10m 수준. 고정밀 현재 위치를 그대로 보관하지 않는다.
export const roundSearchCoordinate = (value: number) => Math.round(value * 10000) / 10000

const normalizeLabel = (value: string | null | undefined) => {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim()
  return trimmed.slice(0, SEARCH_LOCATION_LABEL_MAX_LENGTH)
}

export const buildParentSearchLocation = (input: {
  latitude: unknown
  longitude: unknown
  label: unknown
  source: unknown
}): ParentSearchLocation | null => {
  const lat = typeof input.latitude === "number" ? input.latitude : Number.NaN
  const lng = typeof input.longitude === "number" ? input.longitude : Number.NaN

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return null
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return null
  }

  if (input.source !== "current" && input.source !== "address") {
    return null
  }

  const label = normalizeLabel(typeof input.label === "string" ? input.label : "")
  if (!label) {
    return null
  }

  return {
    v: 1,
    lat: roundSearchCoordinate(lat),
    lng: roundSearchCoordinate(lng),
    label,
    source: input.source
  }
}

// cookie 값은 신뢰하지 않는다. 형식이 어긋나면 "위치 미설정" 으로 처리한다.
export const parseParentSearchLocation = (raw: string | null | undefined): ParentSearchLocation | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed?.v !== 1) {
      return null
    }

    return buildParentSearchLocation({
      latitude: parsed.lat,
      longitude: parsed.lng,
      label: parsed.label,
      source: parsed.source
    })
  } catch {
    return null
  }
}

export const serializeParentSearchLocation = (location: ParentSearchLocation) =>
  JSON.stringify(location)

export const formatDistanceLabel = (distanceKm: number) => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return null
  }

  if (distanceKm < 1) {
    const meters = Math.max(10, Math.round(distanceKm * 100) * 10)
    if (meters < 1000) {
      return `${meters}m`
    }
  }

  return `${distanceKm.toFixed(1)}km`
}
