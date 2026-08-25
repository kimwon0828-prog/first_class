"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { BottomSheet } from "@/shared/ui/bottom-sheet"

import {
  findCatalogSido,
  findCatalogSigungu,
  type RegionCatalog,
  type RegionSelection
} from "../lib/region-selection"
import { SEARCH_RADIUS_OPTIONS, type SearchRadiusKm } from "../lib/search-location"
import {
  clearSearchLocationAction,
  setCurrentSearchLocationAction
} from "../actions/search-location-actions"

export type ClassesLocationMode = "all" | "nearby" | "region"

type ClassesLocationFilterProps = {
  mode: ClassesLocationMode
  label: string
  radiusKm: SearchRadiusKm
  regionCatalog: RegionCatalog
  regionSelection: RegionSelection | null
  className?: string
  triggerClassName?: string
  labelClassName?: string
  iconClassName?: string
  chevronWrapClassName?: string
  openChevronClassName?: string
  radiusRailClassName?: string
  radiusChipClassName?: string
  radiusChipActiveClassName?: string
}

const GEOLOCATION_FAILURE_MESSAGE = "현재 위치를 확인할 수 없어요. 지역으로 찾아보세요."
const GEOLOCATION_TIMEOUT_MS = 10000
const MANAGED_QUERY_KEYS = ["region", "sido", "sigungu", "bname", "radius"] as const

type SheetView = "modes" | "sido" | "sigungu" | "bname"

const MapPinIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const rowStyle = {
  width: "100%",
  minHeight: 52,
  padding: "0 var(--gutter)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  textAlign: "left" as const,
  border: 0,
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 15,
  cursor: "pointer"
}

const backRowStyle = {
  ...rowStyle,
  minHeight: 44,
  justifyContent: "flex-start",
  color: "var(--text-2)",
  fontSize: 13,
  fontWeight: 600
}

const noticeStyle = {
  margin: 0,
  padding: "16px var(--gutter)",
  fontSize: 13,
  lineHeight: "20px",
  color: "var(--text-2)"
}

const readCurrentPosition = () =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("geolocation_unsupported"))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        reject(new Error("geolocation_failed"))
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 }
    )
  })

export function ClassesLocationFilter({
  mode,
  label,
  radiusKm,
  regionCatalog,
  regionSelection,
  className,
  triggerClassName,
  labelClassName,
  iconClassName,
  chevronWrapClassName,
  openChevronClassName,
  radiusRailClassName,
  radiusChipClassName,
  radiusChipActiveClassName
}: ClassesLocationFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<SheetView>("modes")
  const [draftSido, setDraftSido] = useState<string | null>(null)
  const [draftSigungu, setDraftSigungu] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isWorking, setIsWorking] = useState(false)

  const busy = isPending || isWorking
  const chevronClassName = [chevronWrapClassName, isOpen ? openChevronClassName : null]
    .filter(Boolean)
    .join(" ")

  // 위치 관련 query 만 재구성하고 q / subjectCategory / subject / stage 등은 그대로 보존한다.
  const buildHref = (next:
    | { mode: "all" }
    | { mode: "nearby"; radiusKm: SearchRadiusKm }
    | { mode: "region"; selection: RegionSelection }) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const key of MANAGED_QUERY_KEYS) {
      params.delete(key)
    }

    if (next.mode === "nearby") {
      params.set("radius", String(next.radiusKm))
    }

    if (next.mode === "region") {
      params.set("sido", next.selection.sido)
      if (next.selection.sigungu) {
        params.set("sigungu", next.selection.sigungu)
      }
      if (next.selection.bname) {
        params.set("bname", next.selection.bname)
      }
    }

    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const navigate = (href: string) => {
    startTransition(() => {
      router.replace(href)
      router.refresh()
    })
  }

  const closeSheet = () => {
    setIsOpen(false)
    setView("modes")
    setDraftSido(null)
    setDraftSigungu(null)
    setErrorMessage(null)
  }

  const handleSelectAll = async () => {
    setErrorMessage(null)
    setIsWorking(true)
    try {
      await clearSearchLocationAction()
      closeSheet()
      navigate(buildHref({ mode: "all" }))
    } finally {
      setIsWorking(false)
    }
  }

  const handleSelectNearby = async () => {
    setErrorMessage(null)
    setIsWorking(true)
    try {
      const position = await readCurrentPosition()
      const result = await setCurrentSearchLocationAction(position)
      if (!result.ok) {
        setErrorMessage(result.message)
        return
      }
      closeSheet()
      navigate(buildHref({ mode: "nearby", radiusKm }))
    } catch {
      setErrorMessage(GEOLOCATION_FAILURE_MESSAGE)
    } finally {
      setIsWorking(false)
    }
  }

  const applyRegion = async (selection: RegionSelection) => {
    setErrorMessage(null)
    setIsWorking(true)
    try {
      await clearSearchLocationAction()
      closeSheet()
      navigate(buildHref({ mode: "region", selection }))
    } finally {
      setIsWorking(false)
    }
  }

  const handleRadiusChange = (nextRadius: SearchRadiusKm) => {
    navigate(buildHref({ mode: "nearby", radiusKm: nextRadius }))
  }

  const sidoEntry = findCatalogSido(regionCatalog, draftSido)
  const sigunguEntry = findCatalogSigungu(sidoEntry, draftSigungu)

  const sheetTitle =
    view === "modes"
      ? "위치 설정"
      : view === "sido"
        ? "지역 선택"
        : view === "sigungu"
          ? (draftSido ?? "지역 선택")
          : (draftSigungu ?? "지역 선택")

  const renderRow = (
    key: string,
    text: string,
    options: { selected?: boolean; trailing?: "chevron" | "check" | null; onClick: () => void }
  ) => (
    <button
      key={key}
      type="button"
      role="listitem"
      disabled={busy}
      onClick={options.onClick}
      style={{
        ...rowStyle,
        fontWeight: options.selected ? 700 : 500,
        cursor: busy ? "default" : "pointer"
      }}
    >
      <span>{text}</span>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: options.trailing === "check" && options.selected ? "var(--brand-700)" : "var(--text-3)"
        }}
      >
        {options.trailing === "chevron" ? (
          <ChevronRightIcon />
        ) : options.trailing === "check" && options.selected ? (
          <CheckIcon />
        ) : null}
      </span>
    </button>
  )

  return (
    <div className={className} aria-busy={busy}>
      <button
        type="button"
        className={triggerClassName}
        aria-label="위치 설정 열기"
        aria-expanded={isOpen}
        disabled={busy}
        onClick={() => setIsOpen(true)}
        style={{ border: 0, background: "transparent", padding: 0, cursor: busy ? "default" : "pointer" }}
      >
        <span className={iconClassName} aria-hidden="true">
          <MapPinIcon />
        </span>
        <span className={labelClassName}>{label}</span>
        <span className={chevronClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      {mode === "nearby" ? (
        <div className={radiusRailClassName} role="group" aria-label="검색 반경 선택">
          {SEARCH_RADIUS_OPTIONS.map((option) => {
            const isActive = option === radiusKm
            return (
              <button
                key={option}
                type="button"
                className={[radiusChipClassName, isActive ? radiusChipActiveClassName : null]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={isActive}
                disabled={busy}
                onClick={() => handleRadiusChange(option)}
              >
                {option}km
              </button>
            )
          })}
        </div>
      ) : null}

      <BottomSheet open={isOpen} onClose={closeSheet} title={sheetTitle}>
        {view === "modes" ? (
          <div role="list" aria-label="위치 탐색 방식">
            {renderRow("all", "전체", {
              selected: mode === "all",
              trailing: "check",
              onClick: () => {
                void handleSelectAll()
              }
            })}
            {renderRow("nearby", "내 주변", {
              selected: mode === "nearby",
              trailing: "check",
              onClick: () => {
                void handleSelectNearby()
              }
            })}
            {renderRow("region", "지역", {
              selected: mode === "region",
              trailing: "chevron",
              onClick: () => {
                setErrorMessage(null)
                setDraftSido(regionSelection?.sido ?? null)
                setDraftSigungu(regionSelection?.sigungu ?? null)
                setView("sido")
              }
            })}
            {errorMessage ? (
              <p style={noticeStyle} role="status" aria-live="polite">
                {errorMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        {view === "sido" ? (
          <div role="list" aria-label="시도 목록">
            {renderRow("back", "← 위치 설정", { trailing: null, onClick: () => setView("modes") })}
            {regionCatalog.length === 0 ? (
              <p style={noticeStyle}>
                아직 지역으로 찾을 수 있는 학원이 없어요. 전체 또는 내 주변으로 찾아보세요.
              </p>
            ) : (
              regionCatalog.map((entry) =>
                renderRow(entry.sido, entry.sido, {
                  selected: regionSelection?.sido === entry.sido,
                  trailing: entry.sigungus.length > 0 ? "chevron" : "check",
                  onClick: () => {
                    if (entry.sigungus.length === 0) {
                      void applyRegion({ sido: entry.sido, sigungu: null, bname: null })
                      return
                    }
                    setDraftSido(entry.sido)
                    setDraftSigungu(null)
                    setView("sigungu")
                  }
                })
              )
            )}
          </div>
        ) : null}

        {view === "sigungu" && sidoEntry ? (
          <div role="list" aria-label="시군구 목록">
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("sido")}
              style={{ ...backRowStyle, cursor: busy ? "default" : "pointer" }}
            >
              ← 지역 선택
            </button>
            {renderRow("sido-all", `${sidoEntry.sido} 전체`, {
              selected: regionSelection?.sido === sidoEntry.sido && !regionSelection?.sigungu,
              trailing: "check",
              onClick: () => {
                void applyRegion({ sido: sidoEntry.sido, sigungu: null, bname: null })
              }
            })}
            {sidoEntry.sigungus.map((entry) =>
              renderRow(entry.sigungu, entry.sigungu, {
                selected: regionSelection?.sigungu === entry.sigungu,
                trailing: entry.bnames.length > 0 ? "chevron" : "check",
                onClick: () => {
                  if (entry.bnames.length === 0) {
                    void applyRegion({ sido: sidoEntry.sido, sigungu: entry.sigungu, bname: null })
                    return
                  }
                  setDraftSigungu(entry.sigungu)
                  setView("bname")
                }
              })
            )}
          </div>
        ) : null}

        {view === "bname" && sidoEntry && sigunguEntry ? (
          <div role="list" aria-label="읍면동 목록">
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("sigungu")}
              style={{ ...backRowStyle, cursor: busy ? "default" : "pointer" }}
            >
              ← {sidoEntry.sido}
            </button>
            {renderRow("sigungu-all", `${sigunguEntry.sigungu} 전체`, {
              selected:
                regionSelection?.sigungu === sigunguEntry.sigungu && !regionSelection?.bname,
              trailing: "check",
              onClick: () => {
                void applyRegion({ sido: sidoEntry.sido, sigungu: sigunguEntry.sigungu, bname: null })
              }
            })}
            {sigunguEntry.bnames.map((bname) =>
              renderRow(bname, bname, {
                selected: regionSelection?.bname === bname,
                trailing: "check",
                onClick: () => {
                  void applyRegion({ sido: sidoEntry.sido, sigungu: sigunguEntry.sigungu, bname })
                }
              })
            )}
          </div>
        ) : null}
      </BottomSheet>
    </div>
  )
}
