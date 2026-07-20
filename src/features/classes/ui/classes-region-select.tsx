"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"

import { academyAreaOptions, type AcademyArea } from "@/shared/config/academy-areas"

type AcademyAreaFilter = AcademyArea | null
const ALL_ACADEMY_AREA_VALUE = "all"
const ALL_ACADEMY_AREA_LABEL = "전체 학원가"
const PRIORITY_ACADEMY_AREA: AcademyArea = "은행사거리학원가"
const orderedAcademyAreaOptions = [
  PRIORITY_ACADEMY_AREA,
  ...academyAreaOptions.filter((option) => option !== PRIORITY_ACADEMY_AREA)
]

type ClassesRegionSelectProps = {
  selectedRegion: AcademyAreaFilter
  label?: string
  hideLabel?: boolean
  className?: string
  selectClassName?: string
}

type ClassesSearchInputProps = {
  initialQuery: string
  label?: string
  hideLabel?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
}

type ClassesSearchPillProps = {
  initialQuery: string
  placeholder: string
  className?: string
  pillClassName?: string
  inputClassName?: string
}

type ClassesRegionInlineSelectProps = {
  selectedRegion: AcademyAreaFilter
  className?: string
  rowClassName?: string
  nameClassName?: string
  chevronWrapClassName?: string
}

type ClassesSubjectGridItem = {
  label: string
  emoji: string
}

type ClassesSubjectGridProps = {
  items: readonly ClassesSubjectGridItem[]
  selectedSubject: string | null
  gridClassName: string
  itemClassName: string
  itemActiveClassName: string
  emojiClassName: string
  labelClassName: string
}

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  fontSize: 14,
  color: "#111827"
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  fontSize: 14,
  color: "#111827"
}

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 21L16.65 16.65"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const LocationIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 22s7-5.686 7-12a7 7 0 1 0-14 0c0 6.314 7 12 7 12Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M6 9l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const formatAcademyAreaLabel = (value: AcademyAreaFilter) => {
  if (!value) {
    return ALL_ACADEMY_AREA_LABEL
  }
  if (value === PRIORITY_ACADEMY_AREA) {
    return "중계 은행사거리 학원가"
  }
  if (value.includes(" ") || !value.endsWith("학원가")) {
    return value
  }
  return value.replace(/학원가$/, " 학원가")
}

const escapeQueryValue = (value: string) =>
  value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/ /g, "%20")

const buildHref = (
  pathname: string,
  params: { region?: string | null; subject?: string | null; q?: string | null; stage?: string | null }
) => {
  const parts: string[] = []
  if (params.region) parts.push(`region=${escapeQueryValue(params.region)}`)
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  if (params.stage) parts.push(`stage=${escapeQueryValue(params.stage)}`)
  return parts.length ? `${pathname}?${parts.join("&")}` : pathname
}

export function ClassesSearchInput({
  initialQuery,
  label = "검색",
  hideLabel = false,
  placeholder = "과목, 지역으로 검색",
  className,
  inputClassName
}: ClassesSearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const applyQuery = (nextValue: string) => {
    const normalized = nextValue.trim()
    const region = searchParams.get("region")
    const subject = searchParams.get("subject")
    const stage = searchParams.get("stage")
    router.replace(buildHref(pathname, { region, subject, q: normalized || null, stage }))
  }

  const scheduleApply = (nextValue: string) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      applyQuery(nextValue)
    }, 250)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        applyQuery(value)
      }}
      className={className}
      style={className ? undefined : { display: "grid", gap: 6 }}
    >
      <label style={{ display: "grid", gap: 6 }}>
        {!hideLabel ? <span style={{ fontSize: 14, color: "#374151" }}>{label}</span> : null}
        <input
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            setValue(nextValue)
            scheduleApply(nextValue)
          }}
          placeholder={placeholder}
          inputMode="search"
          className={inputClassName}
          style={inputClassName ? undefined : inputStyle}
        />
      </label>
    </form>
  )
}

export function ClassesRegionSelect({
  selectedRegion,
  label = "지역",
  hideLabel = false,
  className,
  selectClassName
}: ClassesRegionSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleChange = (nextRegion: AcademyAreaFilter) => {
    const subject = searchParams.get("subject")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    router.push(buildHref(pathname, { region: nextRegion, subject, q, stage }))
  }

  return (
    <label className={className} style={className ? undefined : { display: "grid", gap: 6 }}>
      {!hideLabel ? <span style={{ fontSize: 14, color: "#374151" }}>{label}</span> : null}
      <select
        aria-label="학원가 선택"
        value={selectedRegion ?? ALL_ACADEMY_AREA_VALUE}
        onChange={(event) =>
          handleChange(event.target.value === ALL_ACADEMY_AREA_VALUE ? null : (event.target.value as AcademyArea))
        }
        className={selectClassName}
        style={selectClassName ? undefined : selectStyle}
      >
        <option value={ALL_ACADEMY_AREA_VALUE}>{ALL_ACADEMY_AREA_LABEL}</option>
        {orderedAcademyAreaOptions.map((option) => (
          <option key={option} value={option}>
            {formatAcademyAreaLabel(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ClassesSearchPill({
  initialQuery,
  placeholder,
  className,
  pillClassName,
  inputClassName
}: ClassesSearchPillProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const applyQuery = (nextValue: string) => {
    const normalized = nextValue.trim()
    const region = searchParams.get("region")
    const subject = searchParams.get("subject")
    const stage = searchParams.get("stage")
    router.replace(buildHref(pathname, { region, subject, q: normalized || null, stage }))
  }

  const scheduleApply = (nextValue: string) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      applyQuery(nextValue)
    }, 250)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        applyQuery(value)
      }}
      className={className}
    >
      <div className={pillClassName}>
        <SearchIcon />
        <input
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            setValue(nextValue)
            scheduleApply(nextValue)
          }}
          placeholder={placeholder}
          inputMode="search"
          className={inputClassName}
          style={inputClassName ? undefined : { ...inputStyle, border: 0, padding: 0 }}
        />
      </div>
    </form>
  )
}

export function ClassesRegionInlineSelect({
  selectedRegion,
  className,
  rowClassName,
  nameClassName,
  chevronWrapClassName
}: ClassesRegionInlineSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [currentRegion, setCurrentRegion] = useState<AcademyAreaFilter>(selectedRegion)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setCurrentRegion(selectedRegion)
  }, [selectedRegion])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [isOpen])

  const handleChange = (nextRegion: AcademyAreaFilter) => {
    const subject = searchParams.get("subject")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    router.push(buildHref(pathname, { region: nextRegion, subject, q, stage }))
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", display: "inline-block" }}
    >
      <div className={rowClassName}>
        <LocationIcon />
        <button
          type="button"
          aria-label="학원가 선택 열기"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            border: 0,
            background: "transparent",
            padding: 0,
            color: "inherit",
            cursor: "pointer"
          }}
        >
          <span className={nameClassName}>{formatAcademyAreaLabel(currentRegion)}</span>
        </button>
        <span className={chevronWrapClassName}>
          <button
            type="button"
            aria-label="학원가 선택 열기"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              border: 0,
              background: "transparent",
              padding: 0,
              color: "inherit",
              cursor: "pointer"
            }}
          >
            <ChevronDownIcon />
          </button>
        </span>
      </div>

      {isOpen ? (
        <div
          role="menu"
          aria-label="학원가 선택"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            left: 0,
            minWidth: 200,
            borderRadius: 14,
            border: "1px solid #eeeeee",
            background: "#ffffff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
            padding: 6,
            zIndex: 80
          }}
        >
          {[null, ...orderedAcademyAreaOptions].map((option) => {
            const isActive = option === currentRegion
            return (
              <button
                key={option ?? ALL_ACADEMY_AREA_VALUE}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setCurrentRegion(option)
                  setIsOpen(false)
                  handleChange(option)
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  background: isActive ? "#f3fbf4" : "transparent",
                  color: "#111111",
                  padding: "10px 10px",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer"
                }}
              >
                {formatAcademyAreaLabel(option)}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function ClassesSubjectGrid({
  items,
  selectedSubject,
  gridClassName,
  itemClassName,
  itemActiveClassName,
  emojiClassName,
  labelClassName
}: ClassesSubjectGridProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleToggle = (label: string) => {
    const region = searchParams.get("region")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    const currentSubject = searchParams.get("subject")
    router.push(buildHref(pathname, { region, q, subject: currentSubject === label ? null : label, stage }))
  }

  return (
    <div className={gridClassName}>
      {items.map((item) => {
        const isActive = selectedSubject === item.label
        return (
          <button
            key={item.label}
            type="button"
            className={`${itemClassName}${isActive ? ` ${itemActiveClassName}` : ""}`}
            onClick={() => handleToggle(item.label)}
          >
            <span className={emojiClassName}>{item.emoji}</span>
            <span className={labelClassName}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
