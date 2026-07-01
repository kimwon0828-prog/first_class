"use client"

import { useEffect, useRef, useState } from "react"

import { getPublicEnv } from "@/shared/config/env"

type NaverMapByAddressProps = {
  address: string
  addressDetail?: string | null
  markerLabel?: string | null
  height?: number | string
}

type MapStatus = "idle" | "loading" | "ready" | "error"

type NaverGeocodeAddress = {
  x: string
  y: string
}

type NaverGeocodeResponse = {
  v2?: {
    addresses?: NaverGeocodeAddress[]
  }
}

type NaverMapDebugInfo = {
  reason: string
  originalAddress: string
  geocodeQuery: string | null
  scriptLoaded: boolean
  hasNaver: boolean
  hasMaps: boolean
  hasService: boolean
  hasGeocode: boolean
  geocodeStatus: string | null
}

declare global {
  interface Window {
    naver?: {
      maps?: {
        Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown
        Marker: new (options: Record<string, unknown>) => unknown
        LatLng: new (lat: number, lng: number) => unknown
        Service?: {
          Status?: {
            OK?: string
          }
          geocode: (
            options: { query: string },
            callback: (status: string, response: NaverGeocodeResponse) => void
          ) => void
        }
      }
    }
  }
}

const SCRIPT_ID = "first-class-naver-map-script"
const SCRIPT_SRC_PREFIX = "https://oapi.map.naver.com/openapi/v3/maps.js"
const SDK_READY_TIMEOUT_MS = 4000
const SDK_POLL_INTERVAL_MS = 50

const buildNaverMapScriptUrl = (clientId: string) =>
  `${SCRIPT_SRC_PREFIX}?ncpKeyId=${clientId}&submodules=geocoder`

const getExistingNaverMapScript = () => {
  const byId = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (byId) {
    return byId
  }

  return (
    Array.from(document.querySelectorAll("script")).find((script) =>
      script.src.startsWith(SCRIPT_SRC_PREFIX)
    ) as HTMLScriptElement | undefined
  ) ?? null
}

const isNaverGeocodeReady = () =>
  Boolean(
    window.naver?.maps &&
      window.naver.maps.Service &&
      typeof window.naver.maps.Service.geocode === "function"
  )

const getDebugInfo = ({
  originalAddress,
  geocodeQuery,
  geocodeStatus
}: {
  originalAddress: string
  geocodeQuery: string | null
  geocodeStatus: string | null
}): NaverMapDebugInfo => {
  const script = getExistingNaverMapScript()

  return {
    reason: "unknown",
    originalAddress,
    geocodeQuery,
    scriptLoaded: Boolean(script && (script.dataset.loaded === "true" || window.naver?.maps)),
    hasNaver: Boolean(window.naver),
    hasMaps: Boolean(window.naver?.maps),
    hasService: Boolean(window.naver?.maps?.Service),
    hasGeocode: typeof window.naver?.maps?.Service?.geocode === "function",
    geocodeStatus
  }
}

const logMapError = (
  reason: string,
  input: {
    originalAddress: string
    geocodeQuery: string | null
    geocodeStatus: string | null
    extra?: Record<string, unknown>
  }
) => {
  console.error("[naver map] render failed", {
    ...getDebugInfo({
      originalAddress: input.originalAddress,
      geocodeQuery: input.geocodeQuery,
      geocodeStatus: input.geocodeStatus
    }),
    reason,
    ...input.extra
  })
}

const waitForNaverSdkReady = async (
  script: HTMLScriptElement,
  timeoutMs = SDK_READY_TIMEOUT_MS
) => {
  if (typeof window === "undefined") {
    throw new Error("window_unavailable")
  }

  if (isNaverGeocodeReady()) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      if (isNaverGeocodeReady()) {
        resolve()
        return
      }

      if (script.dataset.loadError === "true") {
        reject(new Error("script_load_failed"))
        return
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("naver_geocoder_timeout"))
        return
      }

      window.setTimeout(check, SDK_POLL_INTERVAL_MS)
    }

    check()
  })
}

const ensureNaverMapScript = async (clientId: string) => {
  if (typeof window === "undefined") {
    throw new Error("window_unavailable")
  }

  if (isNaverGeocodeReady()) {
    return
  }

  let script = getExistingNaverMapScript()

  if (!script) {
    script = document.createElement("script")
    script.id = SCRIPT_ID
    script.async = true
    script.src = buildNaverMapScriptUrl(clientId)
    script.addEventListener("load", () => {
      script!.dataset.loaded = "true"
    })
    script.addEventListener("error", () => {
      script!.dataset.loadError = "true"
    })
    document.head.appendChild(script)
  }

  await waitForNaverSdkReady(script)
}

const buildGeocodeQueries = (originalAddress: string) => {
  const normalized = originalAddress.replace(/\s+/g, " ").trim()
  const stripped = normalized
    .replace(/\s+\d+층(?:\s+\d+(?:-\d+)?)?/g, "")
    .replace(/\s+\d+(?:-\d+)?호/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  return stripped && stripped !== normalized ? [normalized, stripped] : [normalized]
}

const geocodeAddressWithRetry = async (originalAddress: string) => {
  const service = window.naver?.maps?.Service

  if (!service || typeof service.geocode !== "function") {
    throw new Error("naver_map_unavailable")
  }

  const successStatus = service.Status?.OK ?? "OK"
  const queries = buildGeocodeQueries(originalAddress)
  let lastStatus: string | null = null
  let lastQuery: string | null = null

  for (const query of queries) {
    lastQuery = query

    const { status, response } = await new Promise<{
      status: string
      response: NaverGeocodeResponse
    }>((resolve) => {
      service.geocode({ query }, (geocodeStatus, geocodeResponse) => {
        resolve({
          status: geocodeStatus,
          response: geocodeResponse
        })
      })
    })

    lastStatus = status
    const addresses = response?.v2?.addresses ?? []
    const firstAddress = addresses[0]

    if (status === successStatus && firstAddress) {
      return {
        address: firstAddress,
        geocodeQuery: query,
        geocodeStatus: status
      }
    }
  }

  logMapError("geocode_failed", {
    originalAddress,
    geocodeQuery: lastQuery,
    geocodeStatus: lastStatus
  })

  throw new Error("geocode_failed")
}

export const NaverMapByAddress = ({
  address,
  addressDetail,
  markerLabel,
  height = 260
}: NaverMapByAddressProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<MapStatus>("idle")
  const geocodeAddress = address.trim()
  const displayAddress = `${address ?? ""} ${addressDetail ?? ""}`.trim()
  const mapHeight = typeof height === "number" ? `${height}px` : height
  const { naverMapClientId } = getPublicEnv()

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      const container = containerRef.current

      if (!geocodeAddress) {
        logMapError("missing_geocode_address", {
          originalAddress: geocodeAddress,
          geocodeQuery: null,
          geocodeStatus: null
        })
        setStatus("error")
        return
      }

      if (!container) {
        logMapError("missing_map_container", {
          originalAddress: geocodeAddress,
          geocodeQuery: null,
          geocodeStatus: null
        })
        setStatus("error")
        return
      }

      if (!naverMapClientId) {
        logMapError("missing_naver_map_client_id", {
          originalAddress: geocodeAddress,
          geocodeQuery: null,
          geocodeStatus: null
        })
        setStatus("error")
        return
      }

      const containerHeight = container.getBoundingClientRect().height
      if (containerHeight <= 0) {
        logMapError("invalid_map_container_height", {
          originalAddress: geocodeAddress,
          geocodeQuery: null,
          geocodeStatus: null,
          extra: { containerHeight }
        })
        setStatus("error")
        return
      }

      try {
        setStatus("loading")
        await ensureNaverMapScript(naverMapClientId)

        const mapApi = window.naver?.maps
        if (!mapApi || !window.naver?.maps?.Service) {
          logMapError("naver_map_unavailable", {
            originalAddress: geocodeAddress,
            geocodeQuery: null,
            geocodeStatus: null
          })
          throw new Error("naver_map_unavailable")
        }

        const { address: geocodedAddress, geocodeQuery, geocodeStatus } =
          await geocodeAddressWithRetry(geocodeAddress)

        const lat = Number(geocodedAddress.y)
        const lng = Number(geocodedAddress.x)

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          logMapError("invalid_geocode_result", {
            originalAddress: geocodeAddress,
            geocodeQuery,
            geocodeStatus,
            extra: { lat, lng }
          })
          throw new Error("invalid_geocode_result")
        }

        if (cancelled || !containerRef.current) {
          return
        }

        const position = new mapApi.LatLng(lat, lng)
        const map = new mapApi.Map(containerRef.current, {
          center: position,
          zoom: 16,
          zoomControl: true
        })

        new mapApi.Marker({
          position,
          map,
          title: markerLabel ?? (displayAddress || geocodeAddress)
        })

        if (!cancelled) {
          setStatus("ready")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error"

        if (message === "naver_geocoder_timeout") {
          logMapError("naver_geocoder_timeout", {
            originalAddress: geocodeAddress,
            geocodeQuery: null,
            geocodeStatus: null
          })
        }

        if (message === "script_load_failed" || message === "script_element_missing") {
          logMapError(message, {
            originalAddress: geocodeAddress,
            geocodeQuery: null,
            geocodeStatus: null
          })
        }

        if (message !== "geocode_failed") {
          logMapError("map_init_failed", {
            originalAddress: geocodeAddress,
            geocodeQuery: null,
            geocodeStatus: null,
            extra: { message }
          })
        }

        if (!cancelled) {
          setStatus("error")
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
    }
  }, [displayAddress, geocodeAddress, markerLabel, naverMapClientId])

  if (status === "error") {
    return (
      <div
        style={{
          border: "1px solid #eeeeee",
          borderRadius: 16,
          padding: 16,
          background: "#fafafa"
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111111" }}>
          지도를 불러오지 못했어요. 네이버 지도에서 위치를 확인해 주세요.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#4a4a4a" }}>
          {displayAddress || geocodeAddress}
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 12
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: mapHeight,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #eeeeee",
          background: "#f7f7f7"
        }}
      />
      {status === "loading" ? (
        <p style={{ margin: 0, fontSize: 13, color: "#8a8a8a" }}>지도를 불러오는 중이에요...</p>
      ) : null}
    </div>
  )
}
