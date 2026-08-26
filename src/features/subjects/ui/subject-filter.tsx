"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { BottomSheet } from "@/shared/ui/bottom-sheet"
import type { Subject, SubjectCatalogCategory } from "@/shared/lib/subject-master"

type SubjectFilterProps = {
  catalog: SubjectCatalogCategory[]
  selectedCategory: SubjectCatalogCategory | null
  selectedSubject: Subject | null
  label: string
  className?: string
  triggerClassName?: string
  labelClassName?: string
  chevronWrapClassName?: string
  openChevronClassName?: string
}

// 이 필터가 소유하는 query 는 두 개뿐이다. 나머지(grade/sort/위치)는 그대로 보존한다.
const MANAGED_QUERY_KEYS = ["subjectCategory", "subject"] as const

const ALL_SUBJECTS_LABEL = "전체 과목"

type SheetView = "categories" | "subjects"

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

export function SubjectFilter({
  catalog,
  selectedCategory,
  selectedSubject,
  label,
  className,
  triggerClassName,
  labelClassName,
  chevronWrapClassName,
  openChevronClassName
}: SubjectFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<SheetView>("categories")
  const [draftCategoryCode, setDraftCategoryCode] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const chevronClassName = [chevronWrapClassName, isOpen ? openChevronClassName : null]
    .filter(Boolean)
    .join(" ")

  // 과목 query 만 재구성하고 grade / sort / 위치 query 는 그대로 보존한다.
  const buildHref = (next: { categoryCode?: string | null; subjectCode?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const key of MANAGED_QUERY_KEYS) {
      params.delete(key)
    }

    if (next.categoryCode) {
      params.set("subjectCategory", next.categoryCode)
      if (next.subjectCode) {
        params.set("subject", next.subjectCode)
      }
    }

    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const closeSheet = () => {
    setIsOpen(false)
    setView("categories")
    setDraftCategoryCode(null)
  }

  const navigate = (href: string) => {
    closeSheet()
    startTransition(() => {
      router.replace(href)
      router.refresh()
    })
  }

  const draftCategory = draftCategoryCode
    ? catalog.find((item) => item.code === draftCategoryCode) ?? null
    : null

  const renderRow = (
    key: string,
    text: string,
    options: { selected?: boolean; trailing?: "chevron" | "check" | null; onClick: () => void }
  ) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={Boolean(options.selected)}
      disabled={isPending}
      onClick={options.onClick}
      style={{
        ...rowStyle,
        fontWeight: options.selected ? 700 : 500,
        cursor: isPending ? "default" : "pointer"
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
    <div className={className} aria-busy={isPending}>
      <button
        type="button"
        className={triggerClassName}
        aria-label="과목 선택 열기"
        aria-expanded={isOpen}
        disabled={isPending}
        onClick={() => {
          setDraftCategoryCode(selectedCategory?.code ?? null)
          setView("categories")
          setIsOpen(true)
        }}
        style={{ cursor: isPending ? "default" : "pointer" }}
      >
        <span className={labelClassName}>과목 · {label}</span>
        <span className={chevronClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      <BottomSheet
        open={isOpen}
        onClose={closeSheet}
        title={view === "categories" ? "과목 선택" : (draftCategory?.name ?? "과목 선택")}
      >
        {view === "categories" ? (
          <div role="listbox" aria-label="과목 선택">
            {catalog.length === 0 ? (
              <p style={noticeStyle}>아직 과목으로 찾을 수 있는 수업이 없어요.</p>
            ) : (
              <>
                {renderRow("all", ALL_SUBJECTS_LABEL, {
                  selected: !selectedCategory,
                  trailing: "check",
                  onClick: () => navigate(buildHref({ categoryCode: null }))
                })}
                {catalog.map((category) =>
                  renderRow(category.code, category.name, {
                    selected: selectedCategory?.code === category.code,
                    trailing: category.subjects.length > 0 ? "chevron" : "check",
                    onClick: () => {
                      if (category.subjects.length === 0) {
                        navigate(buildHref({ categoryCode: category.code }))
                        return
                      }

                      setDraftCategoryCode(category.code)
                      setView("subjects")
                    }
                  })
                )}
              </>
            )}
          </div>
        ) : null}

        {view === "subjects" && draftCategory ? (
          <>
            <button
              type="button"
              onClick={() => setView("categories")}
              style={backRowStyle}
              disabled={isPending}
            >
              ← 과목 전체
            </button>
            <div role="listbox" aria-label={`${draftCategory.name} 세부 과목`}>
            {renderRow("category-all", `${draftCategory.name} 전체`, {
              selected: selectedCategory?.code === draftCategory.code && !selectedSubject,
              trailing: "check",
              onClick: () => navigate(buildHref({ categoryCode: draftCategory.code }))
            })}
            {draftCategory.subjects.map((subject) =>
              renderRow(subject.code, subject.name, {
                selected:
                  selectedCategory?.code === draftCategory.code &&
                  selectedSubject?.code === subject.code,
                trailing: "check",
                onClick: () =>
                  navigate(
                    buildHref({ categoryCode: draftCategory.code, subjectCode: subject.code })
                  )
              })
            )}
            </div>
          </>
        ) : null}
      </BottomSheet>
    </div>
  )
}
