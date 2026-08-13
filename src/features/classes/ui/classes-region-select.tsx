"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState, useTransition } from "react"

import { academyAreaConfigs, academyAreaOptions, getAcademyAreaConfig, type AcademyArea } from "@/shared/config/academy-areas"
import { BottomSheet } from "@/shared/ui/bottom-sheet"

type AcademyAreaFilter = AcademyArea | null
const ALL_ACADEMY_AREA_VALUE = "all"
const ALL_ACADEMY_AREA_LABEL = "전체 학원가"
const PRIORITY_ACADEMY_AREA: AcademyArea = "은행사거리학원가"
const orderedAcademyAreaConfigs = [
  getAcademyAreaConfig(PRIORITY_ACADEMY_AREA),
  ...academyAreaOptions
    .filter((option) => option !== PRIORITY_ACADEMY_AREA)
    .map((option) => getAcademyAreaConfig(option))
].filter((config): config is (typeof academyAreaConfigs)[number] => config !== null)
const optionStatusBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 52,
  height: 24,
  padding: "0 8px",
  borderRadius: 999,
  background: "var(--surface-sub)",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  color: "var(--text-3)"
}

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
  iconClassName?: string
  chevronWrapClassName?: string
  openChevronClassName?: string
}

type ClassesSubjectGridItem = {
  value: string
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

const pendingTextStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: "16px",
  color: "#2aad38",
  fontWeight: 700
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

const CheckIcon = ({ className }: { className?: string }) => (
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
      d="M5 13l4 4L19 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const MapPinIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
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
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const applyQuery = (nextValue: string) => {
    const normalized = nextValue.trim()
    const region = searchParams.get("region")
    const subject = searchParams.get("subject")
    const stage = searchParams.get("stage")
    startTransition(() => {
      router.replace(buildHref(pathname, { region, subject, q: normalized || null, stage }))
    })
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
      aria-busy={isPending}
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
        {isPending ? (
          <span style={pendingTextStyle} role="status" aria-live="polite">
            불러오는 중...
          </span>
        ) : null}
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
  const [isPending, startTransition] = useTransition()

  const handleChange = (nextRegion: AcademyAreaFilter) => {
    const subject = searchParams.get("subject")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    startTransition(() => {
      router.push(buildHref(pathname, { region: nextRegion, subject, q, stage }))
    })
  }

  return (
    <label
      className={className}
      style={className ? undefined : { display: "grid", gap: 6 }}
      aria-busy={isPending}
    >
      {!hideLabel ? <span style={{ fontSize: 14, color: "#374151" }}>{label}</span> : null}
      <select
        aria-label="학원가 선택"
        value={selectedRegion ?? ALL_ACADEMY_AREA_VALUE}
        onChange={(event) =>
          handleChange(event.target.value === ALL_ACADEMY_AREA_VALUE ? null : (event.target.value as AcademyArea))
        }
        className={selectClassName}
        disabled={isPending}
        aria-disabled={isPending}
        style={selectClassName ? undefined : selectStyle}
      >
        <option value={ALL_ACADEMY_AREA_VALUE}>{ALL_ACADEMY_AREA_LABEL}</option>
        {orderedAcademyAreaConfigs.map((option) => (
          <option key={option.value} value={option.value} disabled={!option.enabled}>
            {option.statusLabel
              ? `${formatAcademyAreaLabel(option.value)} · ${option.statusLabel}`
              : formatAcademyAreaLabel(option.value)}
          </option>
        ))}
      </select>
      {isPending ? (
        <span style={pendingTextStyle} role="status" aria-live="polite">
          불러오는 중...
        </span>
      ) : null}
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
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const applyQuery = (nextValue: string) => {
    const normalized = nextValue.trim()
    const region = searchParams.get("region")
    const subject = searchParams.get("subject")
    const stage = searchParams.get("stage")
    startTransition(() => {
      router.replace(buildHref(pathname, { region, subject, q: normalized || null, stage }))
    })
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
      aria-busy={isPending}
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
      {isPending ? (
        <span style={pendingTextStyle} role="status" aria-live="polite">
          불러오는 중...
        </span>
      ) : null}
    </form>
  )
}

export function ClassesRegionInlineSelect({
  selectedRegion,
  className,
  rowClassName,
  nameClassName,
  iconClassName,
  chevronWrapClassName,
  openChevronClassName
}: ClassesRegionInlineSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [currentRegion, setCurrentRegion] = useState<AcademyAreaFilter>(selectedRegion)
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCurrentRegion(selectedRegion)
  }, [selectedRegion])

  const triggerClassName = [rowClassName].filter(Boolean).join(" ")
  const chevronClassName = [chevronWrapClassName, isOpen ? openChevronClassName : null].filter(Boolean).join(" ")

  const handleChange = (nextRegion: AcademyAreaFilter) => {
    const subject = searchParams.get("subject")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    startTransition(() => {
      router.push(buildHref(pathname, { region: nextRegion, subject, q, stage }))
    })
  }

  return (
    <div className={className} aria-busy={isPending}>
      <button
        type="button"
        className={triggerClassName}
        aria-label="학원가 선택 열기"
        aria-expanded={isOpen}
        disabled={isPending}
        onClick={() => setIsOpen(true)}
        style={{
          border: 0,
          background: "transparent",
          padding: 0,
          cursor: isPending ? "default" : "pointer"
        }}
      >
        <span className={iconClassName} aria-hidden="true">
          <MapPinIcon />
        </span>
        <span className={nameClassName}>{formatAcademyAreaLabel(currentRegion)}</span>
        <span className={chevronClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      <BottomSheet open={isOpen} onClose={() => setIsOpen(false)} title="학원가 선택">
        <div role="list" aria-label="학원가 목록">
          {[null, ...orderedAcademyAreaConfigs].map((item, index, options) => {
            const option = item?.value ?? null
            const isDisabled = Boolean(item && !item.enabled)
            const isActive = option === currentRegion
            return (
              <button
                key={option ?? ALL_ACADEMY_AREA_VALUE}
                type="button"
                role="listitem"
                disabled={isPending || isDisabled}
                onClick={() => {
                  if (isDisabled) {
                    return
                  }
                  setCurrentRegion(option)
                  setIsOpen(false)
                  handleChange(option)
                }}
                style={{
                  width: "100%",
                  height: 52,
                  padding: "0 var(--gutter)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  textAlign: "left",
                  border: 0,
                  borderBottom: index < options.length - 1 ? "1px solid var(--border)" : 0,
                  background: "transparent",
                  color: isDisabled ? "var(--text-2)" : "var(--text-1)",
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  cursor: isPending || isDisabled ? "default" : "pointer",
                  opacity: isDisabled ? 0.72 : 1
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: isActive ? 700 : 500,
                    lineHeight: "1.4"
                  }}
                >
                  {formatAcademyAreaLabel(option)}
                </span>
                {item?.statusLabel ? (
                  <span aria-hidden="true" style={optionStatusBadgeStyle}>
                    {item.statusLabel}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isActive ? "var(--brand-700)" : "transparent"
                    }}
                  >
                    <CheckIcon />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </BottomSheet>
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
  const [isPending, startTransition] = useTransition()

  const handleToggle = (value: string) => {
    const region = searchParams.get("region")
    const q = searchParams.get("q")
    const stage = searchParams.get("stage")
    const currentSubject = searchParams.get("subject")
    startTransition(() => {
      router.push(
        buildHref(pathname, { region, q, subject: currentSubject === value ? null : value, stage })
      )
    })
  }

  return (
    <div className={gridClassName} aria-busy={isPending}>
      {items.map((item) => {
        const isActive = selectedSubject === item.value
        return (
          <button
            key={item.value}
            type="button"
            className={`${itemClassName}${isActive ? ` ${itemActiveClassName}` : ""}`}
            onClick={() => handleToggle(item.value)}
            disabled={isPending}
            aria-disabled={isPending}
          >
            <span className={emojiClassName}>{item.emoji}</span>
            <span className={labelClassName}>{item.label}</span>
          </button>
        )
      })}
      {isPending ? (
        <p style={{ ...pendingTextStyle, width: "100%", marginBottom: 0 }} role="status" aria-live="polite">
          불러오는 중...
        </p>
      ) : null}
    </div>
  )
}
