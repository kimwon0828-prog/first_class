"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useTransition } from "react"

import type { StudioDashboardTeacherFilterOption } from "@/shared/lib/db/adapter"
import styles from "@/features/studio/ui/studio-dashboard.module.css"

type StudioTeacherFilterProps = {
  options: StudioDashboardTeacherFilterOption[]
  selectedTeacherId: string
  basePath?: string
}

export const StudioTeacherFilter = ({
  options,
  selectedTeacherId,
  basePath = "/studio"
}: StudioTeacherFilterProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => (a.teacherName > b.teacherName ? 1 : -1))
  }, [options])

  const handleChange = (nextValue: string) => {
    const params = new URLSearchParams(searchParams?.toString())

    if (!nextValue || nextValue === "all") {
      params.delete("teacherId")
    } else {
      params.set("teacherId", nextValue)
    }

    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath)
    })
  }

  return (
    <label className={styles.teacherFilter} aria-busy={isPending}>
      <span className={styles.teacherFilterLabel}>선생님 필터</span>
      <select
        value={selectedTeacherId}
        onChange={(event) => handleChange(event.target.value)}
        className={styles.select}
        disabled={isPending}
        aria-disabled={isPending}
      >
        <option value="all">전체</option>
        {sortedOptions.map((option) => (
          <option key={option.teacherId} value={option.teacherId}>
            {option.teacherName}
          </option>
        ))}
      </select>
      {isPending ? (
        <span
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: "16px",
            color: "#2aad38",
            fontWeight: 700
          }}
          role="status"
          aria-live="polite"
        >
          불러오는 중...
        </span>
      ) : null}
    </label>
  )
}
