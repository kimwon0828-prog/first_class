"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { BottomSheet } from "@/shared/ui/bottom-sheet"
import { ACADEMY_SORT_OPTIONS, type AcademySort } from "../lib/academy-sort"

type AcademySortFilterProps = {
  selectedSort: AcademySort
  // 내 주변에서는 서버가 거리순을 먼저 적용하므로 정렬 선택이 결과에 반영되지 않는다.
  disabledReasonLabel?: string | null
  className?: string
  triggerClassName?: string
  labelClassName?: string
  chevronWrapClassName?: string
  openChevronClassName?: string
}

// 이 필터가 소유하는 query 는 sort 하나뿐이다. 나머지는 그대로 보존한다.
const MANAGED_QUERY_KEY = "sort"

const ChevronDownIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

export function AcademySortFilter({
  selectedSort,
  disabledReasonLabel,
  className,
  triggerClassName,
  labelClassName,
  chevronWrapClassName,
  openChevronClassName
}: AcademySortFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isDisabled = Boolean(disabledReasonLabel)
  const chevronClassName = [chevronWrapClassName, isOpen ? openChevronClassName : null]
    .filter(Boolean)
    .join(" ")

  // sort query 만 재구성하고 과목 / 학년 / 위치 query 는 그대로 보존한다.
  // 추천순은 기본값이므로 URL 에 별도 값을 만들지 않는다.
  const buildHref = (nextSort: AcademySort) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(MANAGED_QUERY_KEY)

    if (nextSort !== "recommended") {
      params.set(MANAGED_QUERY_KEY, nextSort)
    }

    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const closeSheet = () => {
    setIsOpen(false)
  }

  const navigate = (href: string) => {
    closeSheet()
    startTransition(() => {
      router.replace(href)
      router.refresh()
    })
  }

  const activeLabel =
    disabledReasonLabel ??
    ACADEMY_SORT_OPTIONS.find((option) => option.value === selectedSort)?.label ??
    ACADEMY_SORT_OPTIONS[0].label

  return (
    <div className={className} aria-busy={isPending}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={isDisabled ? "내 주변에서는 거리순으로 정렬됩니다" : "정렬 선택 열기"}
        aria-expanded={isOpen}
        aria-disabled={isDisabled}
        disabled={isDisabled || isPending}
        onClick={() => setIsOpen(true)}
        style={{
          cursor: isDisabled || isPending ? "default" : "pointer",
          opacity: isDisabled ? 0.55 : 1
        }}
      >
        <span className={labelClassName}>정렬 · {activeLabel}</span>
        <span className={chevronClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      <BottomSheet open={isOpen} onClose={closeSheet} title="정렬 선택">
        <div role="listbox" aria-label="정렬 선택">
          {ACADEMY_SORT_OPTIONS.map((option) => {
            const selected = option.value === selectedSort
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={isPending}
                onClick={() => navigate(buildHref(option.value))}
                style={{
                  ...rowStyle,
                  fontWeight: selected ? 700 : 500,
                  cursor: isPending ? "default" : "pointer"
                }}
              >
                <span>{option.label}</span>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: selected ? "var(--brand-700)" : "var(--text-3)"
                  }}
                >
                  {selected ? <CheckIcon /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
