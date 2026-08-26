"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { BottomSheet } from "@/shared/ui/bottom-sheet"
import { GRADE_BANDS } from "@/shared/constants/education-taxonomy"

type GradeFilterProps = {
  selectedGrade: string | null
  label: string
  className?: string
  triggerClassName?: string
  labelClassName?: string
  chevronWrapClassName?: string
  openChevronClassName?: string
}

// 이 필터가 소유하는 query 는 grade 하나뿐이다. 나머지는 그대로 보존한다.
const MANAGED_QUERY_KEY = "grade"

const ALL_GRADES_LABEL = "전체 학년"

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

export function GradeFilter({
  selectedGrade,
  label,
  className,
  triggerClassName,
  labelClassName,
  chevronWrapClassName,
  openChevronClassName
}: GradeFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const chevronClassName = [chevronWrapClassName, isOpen ? openChevronClassName : null]
    .filter(Boolean)
    .join(" ")

  // grade query 만 재구성하고 과목 / 정렬 / 위치 query 는 그대로 보존한다.
  const buildHref = (nextGrade: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(MANAGED_QUERY_KEY)

    if (nextGrade) {
      params.set(MANAGED_QUERY_KEY, nextGrade)
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

  const renderRow = (key: string, text: string, selected: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={selected}
      disabled={isPending}
      onClick={onClick}
      style={{
        ...rowStyle,
        fontWeight: selected ? 700 : 500,
        cursor: isPending ? "default" : "pointer"
      }}
    >
      <span>{text}</span>
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

  return (
    <div className={className} aria-busy={isPending}>
      <button
        type="button"
        className={triggerClassName}
        aria-label="학년 선택 열기"
        aria-expanded={isOpen}
        disabled={isPending}
        onClick={() => setIsOpen(true)}
        style={{ cursor: isPending ? "default" : "pointer" }}
      >
        <span className={labelClassName}>학년 · {label}</span>
        <span className={chevronClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      <BottomSheet open={isOpen} onClose={closeSheet} title="학년 선택">
        <div role="listbox" aria-label="학년 선택">
          {renderRow("all", ALL_GRADES_LABEL, !selectedGrade, () => navigate(buildHref(null)))}
          {GRADE_BANDS.map((band) =>
            renderRow(band.value, band.label, selectedGrade === band.value, () =>
              navigate(buildHref(band.value))
            )
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
