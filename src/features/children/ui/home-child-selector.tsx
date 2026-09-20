"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { type ReactNode, useState, useTransition } from "react"

import {
  CHILD_QUERY_KEY,
  formatChildOptionLabel,
  formatChildTriggerLabel,
  shouldOfferAllChildrenOption,
  type ChildSelectorOption
} from "@/features/children/lib/child-selection"
import { BottomSheet } from "@/shared/ui/bottom-sheet"

import styles from "./home-child-selector.module.css"

/**
 * Home 상단의 자녀 선택.
 *
 * ⚠️ 선택 상태는 주소(?child=)에 있다. /record 가 이미 쓰는 계약을 그대로 쓴다 —
 *    cookie · localStorage · DB 를 새로 만들지 않는다.
 *
 * ⚠️ 점수 · 추천 · 대표 자녀 같은 개념을 만들지 않는다. 고른 아이에 체크 하나뿐이다.
 *
 * ⚠️ 아이가 0명이면 이 컴포넌트를 아예 그리지 않는다(호출부가 판정한다).
 *    Home 에서 새 자녀 등록 흐름을 시작하지 않는다.
 */
type HomeChildSelectorProps = {
  options: ChildSelectorOption[]
  selectedChildId: string | null
  className?: string
  manageSheetFocus?: boolean
  unselectedLabel?: string
  labelClassName?: string
  /** Optional child context presentation; selection and URL behavior stay shared. */
  triggerContent?: ReactNode
}

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function HomeChildSelector({
  options,
  selectedChildId,
  className,
  labelClassName,
  triggerContent,
  manageSheetFocus = false,
  unselectedLabel
}: HomeChildSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const triggerLabel = !selectedChildId && unselectedLabel && options.length > 0
    ? unselectedLabel : formatChildTriggerLabel(options, selectedChildId)
  if (!triggerLabel) {
    return null
  }

  /* child 만 set/delete 한다. 지역 · 반경 같은 나머지 조건은 그대로 실려 간다. */
  const buildHref = (nextChildId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (nextChildId) {
      params.set(CHILD_QUERY_KEY, nextChildId)
    } else {
      params.delete(CHILD_QUERY_KEY)
    }
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const select = (nextChildId: string | null) => {
    setOpen(false)
    if (nextChildId === selectedChildId) {
      return
    }
    startTransition(() => {
      router.replace(buildHref(nextChildId))
    })
  }

  const offerAll = Boolean(unselectedLabel) || shouldOfferAllChildrenOption(options)

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${className ?? ""}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={isPending}
        onClick={() => setOpen(true)}
      >
        <span className={`${styles.triggerLabel} ${labelClassName ?? ""}`.trim()}>{triggerContent ?? triggerLabel}</span>
        <ChevronIcon />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="아이 선택" manageFocus={manageSheetFocus}>
        <ul className={styles.list}>
          {offerAll ? (
            <li>
              <button
                type="button"
                className={styles.option}
                aria-current={selectedChildId === null ? "true" : undefined}
                onClick={() => select(null)}
              >
                <span className={styles.optionName}>{unselectedLabel ? "자녀 조건 없이 보기" : "우리 아이 전체"}</span>
                {selectedChildId === null ? (
                  <span className={styles.check} aria-label="선택됨">
                    <CheckIcon />
                  </span>
                ) : null}
              </button>
            </li>
          ) : null}

          {options.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className={styles.option}
                aria-current={selectedChildId === child.id ? "true" : undefined}
                onClick={() => select(child.id)}
              >
                {/* 실제 등록된 이름과 학년만 쓴다. 비어 있으면 이름만 나온다. */}
                <span className={styles.optionName}>{formatChildOptionLabel(child)}</span>
                {selectedChildId === child.id ? (
                  <span className={styles.check} aria-label="선택됨">
                    <CheckIcon />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  )
}
