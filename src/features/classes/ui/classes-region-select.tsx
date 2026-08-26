"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState, useTransition } from "react"

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

// 위치/legacy region 을 제외한 나머지 query 는 그대로 보존한다.
// legacy `region` 은 어떤 경우에도 다시 생성하지 않는다.
const buildHref = (
  pathname: string,
  current: URLSearchParams,
  next: {
    subjectCategory?: string | null
    subject?: string | null
    q?: string | null
    stage?: string | null
  }
) => {
  const params = new URLSearchParams(current.toString())
  params.delete("region")

  for (const [key, value] of Object.entries(next)) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }

  const queryString = params.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
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
    startTransition(() => {
      router.replace(buildHref(pathname, searchParams, { q: normalized || null }))
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
    startTransition(() => {
      router.replace(buildHref(pathname, searchParams, { q: normalized || null }))
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
    const currentSubject = searchParams.get("subject")
    startTransition(() => {
      router.push(
        buildHref(pathname, searchParams, {
          subjectCategory: null,
          subject: currentSubject === value ? null : value
        })
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
