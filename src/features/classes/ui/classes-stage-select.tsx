"use client"

import type { CSSProperties } from "react"
import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { GRADE_OPTIONS, type GradeOption } from "@/shared/constants/grade-options"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { BottomSheet } from "@/shared/ui/bottom-sheet"

const ALL_STAGE_LABEL = "전체 학년"

type ClassesStageSelectProps = {
  className?: string
  rowClassName?: string
  nameClassName?: string
  chevronWrapClassName?: string
}

const escapeQueryValue = (value: string) =>
  value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/ /g, "%20")

const buildHref = (pathname: string, params: { region?: string | null; subject?: string | null; q?: string | null; stage?: string | null }) => {
  const parts: string[] = []
  if (params.region) parts.push(`region=${escapeQueryValue(params.region)}`)
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  if (params.stage) parts.push(`stage=${escapeQueryValue(params.stage)}`)
  return parts.length ? `${pathname}?${parts.join("&")}` : pathname
}

const isGradeOption = (value: string | null): value is GradeOption => {
  return value !== null && GRADE_OPTIONS.includes(value as GradeOption)
}

const PersonIcon = ({ className }: { className?: string }) => (
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
      d="M20 21a8 8 0 1 0-16 0"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
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

const triggerButtonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  background: "transparent",
  padding: 0
}

export function ClassesStageSelect({
  className,
  rowClassName,
  nameClassName,
  chevronWrapClassName
}: ClassesStageSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [currentStage, setCurrentStage] = useState<GradeOption | null>(null)
  const [isPending, startTransition] = useTransition()

  const resolvedStage = (() => {
    const value = searchParams.get("stage")
    return isGradeOption(value) ? value : null
  })()

  useEffect(() => {
    setCurrentStage(resolvedStage)
  }, [resolvedStage])

  const handleChange = (nextStage: GradeOption | null) => {
    const region = searchParams.get("region")
    const subject = searchParams.get("subject")
    const q = searchParams.get("q")

    startTransition(() => {
      router.push(buildHref(pathname, { region, subject, q, stage: nextStage }))
    })
  }

  const currentStageLabel = currentStage ? getChildGradeLabel(currentStage) ?? currentStage : ALL_STAGE_LABEL

  return (
    <div className={className} aria-busy={isPending}>
      <button
        type="button"
        className={rowClassName}
        aria-label="학년 선택 열기"
        aria-expanded={isOpen}
        disabled={isPending}
        onClick={() => setIsOpen(true)}
        style={{ ...triggerButtonStyle, cursor: isPending ? "default" : "pointer" }}
      >
        <PersonIcon />
        <span className={nameClassName}>{currentStageLabel}</span>
        <span className={chevronWrapClassName}>
          <ChevronDownIcon />
        </span>
      </button>

      <BottomSheet open={isOpen} onClose={() => setIsOpen(false)} title="학년 선택">
        <div role="list" aria-label="학년 목록">
          {[null, ...GRADE_OPTIONS].map((option, index, options) => {
            const isActive = option === currentStage
            return (
              <button
                key={option ?? "all"}
                type="button"
                role="listitem"
                disabled={isPending}
                onClick={() => {
                  setCurrentStage(option)
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
                  color: "var(--text-1)",
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  cursor: isPending ? "default" : "pointer"
                }}
              >
                <span style={{ fontSize: 15, fontWeight: isActive ? 700 : 500, lineHeight: "1.4" }}>
                  {option ? (getChildGradeLabel(option) ?? option) : ALL_STAGE_LABEL}
                </span>
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
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
