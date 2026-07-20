"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { getPublicEnv } from "@/shared/config/env"

import styles from "../../../../app/academies/page.module.css"

type AcademyMapMarker = {
  id: string
  label: string
  latitude: number
  longitude: number
}

type AcademiesMapProps = {
  markers: AcademyMapMarker[]
  activeOrganizationId: string | null
  onActiveOrganizationChange: (organizationId: string) => void
}

type MapStatus = "idle" | "loading" | "ready" | "empty" | "error"

type NaverMapInstance = {
  fitBounds?: (bounds: { extend: (position: unknown) => void }) => void
  setCenter?: (position: unknown) => void
  setZoom?: (zoom: number) => void
}

type NaverMarkerInstance = {
  setMap?: (map: NaverMapInstance | null) => void
  setZIndex?: (zIndex: number) => void
  setIcon?: (icon: Record<string, unknown>) => void
}

type NaverMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapInstance
  Marker: new (options: Record<string, unknown>) => NaverMarkerInstance
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds?: new () => { extend: (position: unknown) => void }
  Event?: {
    addListener: (
      target: NaverMarkerInstance,
      eventName: string,
      listener: () => void
    ) => { remove?: () => void } | void
  }
}

const SCRIPT_ID = "first-class-naver-map-script"
const SCRIPT_SRC_PREFIX = "https://oapi.map.naver.com/openapi/v3/maps.js"
const SDK_READY_TIMEOUT_MS = 4000
const SDK_POLL_INTERVAL_MS = 50

const buildNaverMapScriptUrl = (clientId: string) => `${SCRIPT_SRC_PREFIX}?ncpKeyId=${clientId}`

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

const isNaverMapReady = () =>
  Boolean(window.naver?.maps && window.naver.maps.Map && window.naver.maps.Marker && window.naver.maps.LatLng)

const getNaverMapsApi = () => window.naver?.maps as NaverMapsApi | undefined

const waitForNaverSdkReady = async (
  script: HTMLScriptElement,
  timeoutMs = SDK_READY_TIMEOUT_MS
) => {
  if (typeof window === "undefined") {
    throw new Error("window_unavailable")
  }

  if (isNaverMapReady()) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      if (isNaverMapReady()) {
        resolve()
        return
      }

      if (script.dataset.loadError === "true") {
        reject(new Error("script_load_failed"))
        return
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("naver_map_timeout"))
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

  if (isNaverMapReady()) {
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

const createMarkerIcon = (isActive: boolean) => ({
  content: `<div style="
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 3px solid #ffffff;
    background: ${isActive ? "#2AAD38" : "#111111"};
    box-shadow: 0 8px 18px rgba(17, 17, 17, 0.18);
  "></div>`
})

export function AcademiesMap({
  markers,
  activeOrganizationId,
  onActiveOrganizationChange
}: AcademiesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const markerInstancesRef = useRef<Array<{ id: string; marker: NaverMarkerInstance }>>([])
  const [status, setStatus] = useState<MapStatus>("idle")
  const { naverMapClientId } = getPublicEnv()
  const activeMarker = useMemo(
    () => markers.find((marker) => marker.id === activeOrganizationId) ?? markers[0] ?? null,
    [activeOrganizationId, markers]
  )

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      if (!containerRef.current) {
        setStatus("error")
        return
      }

      if (markers.length === 0) {
        setStatus("empty")
        return
      }

      if (!naverMapClientId) {
        setStatus("error")
        return
      }

      try {
        setStatus("loading")
        await ensureNaverMapScript(naverMapClientId)

        const mapApi = getNaverMapsApi()
        if (!mapApi || !containerRef.current || cancelled) {
          setStatus("error")
          return
        }

        const initialMarker = markers.find((marker) => marker.id === activeOrganizationId) ?? markers[0]
        const initialPosition = new mapApi.LatLng(initialMarker.latitude, initialMarker.longitude)
        const map = new mapApi.Map(containerRef.current, {
          center: initialPosition,
          zoom: 14,
          zoomControl: true
        })
        mapRef.current = map

        const bounds = mapApi.LatLngBounds ? new mapApi.LatLngBounds() : null
        const eventApi = mapApi.Event

        markerInstancesRef.current = markers.map((item) => {
          const position = new mapApi.LatLng(item.latitude, item.longitude)
          bounds?.extend(position)

          const marker = new mapApi.Marker({
            map,
            position,
            title: item.label,
            icon: createMarkerIcon(item.id === initialMarker.id)
          })

          eventApi?.addListener?.(marker, "click", () => {
            onActiveOrganizationChange(item.id)
          })

          return { id: item.id, marker }
        })

        if (bounds && typeof map.fitBounds === "function" && markers.length > 1) {
          map.fitBounds(bounds)
        } else if (typeof map.setCenter === "function") {
          map.setCenter(initialPosition)
        }

        setStatus("ready")
      } catch (error) {
        console.error("[academies map] failed to load", error)
        setStatus("error")
      }
    }

    boot()

    return () => {
      cancelled = true
      markerInstancesRef.current.forEach(({ marker }) => marker.setMap?.(null))
      markerInstancesRef.current = []
      mapRef.current = null
    }
  }, [activeOrganizationId, markers, naverMapClientId, onActiveOrganizationChange])

  useEffect(() => {
    const mapApi = getNaverMapsApi()
    if (!mapApi || !activeMarker) {
      return
    }

    markerInstancesRef.current.forEach(({ id, marker }) => {
      marker.setZIndex?.(id === activeMarker.id ? 200 : 100)
      marker.setIcon?.(createMarkerIcon(id === activeMarker.id))
    })

    const position = new mapApi.LatLng(activeMarker.latitude, activeMarker.longitude)
    mapRef.current?.setCenter?.(position)
  }, [activeMarker])

  return (
    <section className={styles.mapPanel} aria-label="학원 위치 지도">
      <div ref={containerRef} className={styles.mapCanvas} />
      {status === "loading" ? <div className={styles.mapOverlay}>지도를 불러오는 중이에요.</div> : null}
      {status === "empty" ? (
        <div className={styles.mapOverlay}>지도에 표시할 학원 좌표를 준비 중이에요.</div>
      ) : null}
      {status === "error" ? (
        <div className={styles.mapOverlay}>지도를 불러오지 못했어요. 아래 학원 카드에서 먼저 둘러보세요.</div>
      ) : null}
    </section>
  )
}
