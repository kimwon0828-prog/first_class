"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { getPublicEnv } from "@/shared/config/env"

type NaverMapByAddressProps = {
  address: string
  markerLabel?: string | null
  height?: number | string
}

type MapStatus = "idle" | "loading" | "ready" | "error"

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
            callback: (status: string, response: { v2?: { addresses?: Array<{ x: string; y: string }> } }) => void
          ) => void
        }
      }
    }
  }
}

const SCRIPT_ID = "first-class-naver-map-script"

const loadNaverMapScript = async (clientId: string) => {
  if (typeof window === "undefined") {
    throw new Error("window_unavailable")
  }

  if (window.naver?.maps?.Service) {
    return
  }

  const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    await new Promise<void>((resolve, reject) => {
      if (window.naver?.maps?.Service) {
        resolve()
        return
      }

      existingScript.addEventListener("load", () => resolve(), { once: true })
      existingScript.addEventListener("error", () => reject(new Error("script_load_failed")), { once: true })
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.async = true
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("script_load_failed"))
    document.head.appendChild(script)
  })
}

export const NaverMapByAddress = ({
  address,
  markerLabel,
  height = 260
}: NaverMapByAddressProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<MapStatus>("idle")
  const fullAddress = address.trim()
  const mapHeight = typeof height === "number" ? `${height}px` : height
  const { naverMapClientId } = getPublicEnv()

  const naverMapUrl = useMemo(
    () => `https://map.naver.com/p/search/${encodeURIComponent(fullAddress)}`,
    [fullAddress]
  )

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      if (!fullAddress || !containerRef.current || !naverMapClientId) {
        setStatus("error")
        return
      }

      try {
        setStatus("loading")
        await loadNaverMapScript(naverMapClientId)

        const service = window.naver?.maps?.Service
        const mapApi = window.naver?.maps
        if (!service || !mapApi) {
          throw new Error("naver_map_unavailable")
        }

        await new Promise<void>((resolve, reject) => {
          service.geocode({ query: fullAddress }, (geocodeStatus, response) => {
            const successStatus = service.Status?.OK ?? "OK"
            const firstAddress = response.v2?.addresses?.[0]

            if (geocodeStatus !== successStatus || !firstAddress) {
              reject(new Error("geocode_failed"))
              return
            }

            const lat = Number(firstAddress.y)
            const lng = Number(firstAddress.x)

            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !containerRef.current) {
              reject(new Error("invalid_geocode_result"))
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
              title: markerLabel ?? fullAddress
            })

            resolve()
          })
        })

        if (!cancelled) {
          setStatus("ready")
        }
      } catch {
        if (!cancelled) {
          setStatus("error")
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
    }
  }, [fullAddress, markerLabel, naverMapClientId])

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
          지도를 불러오지 못했어요.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#4a4a4a" }}>{fullAddress}</p>
        <a
          href={naverMapUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 40,
            borderRadius: 10,
            background: "#2aad38",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            padding: "0 14px"
          }}
        >
          네이버 지도에서 보기
        </a>
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
