"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"

import type { StudioDashboardTeacherFilterOption } from "@/shared/lib/db/adapter"
import styles from "@/features/studio/ui/studio-dashboard.module.css"

type StudioTeacherFilterProps = {
  options: StudioDashboardTeacherFilterOption[]
  selectedTeacherId: string
}

export const StudioTeacherFilter = ({
  options,
  selectedTeacherId
}: StudioTeacherFilterProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()

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
    router.push(query ? `/studio?${query}` : "/studio")
  }

  return (
    <label className={styles.teacherFilter}>
      <span className={styles.teacherFilterLabel}>선생님 필터</span>
      <select
        value={selectedTeacherId}
        onChange={(event) => handleChange(event.target.value)}
        className={styles.select}
      >
        <option value="all">전체</option>
        {sortedOptions.map((option) => (
          <option key={option.teacherId} value={option.teacherId}>
            {option.teacherName}
          </option>
        ))}
      </select>
    </label>
  )
}
