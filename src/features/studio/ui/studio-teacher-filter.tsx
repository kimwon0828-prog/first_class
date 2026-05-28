"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"

import type { StudioDashboardTeacherFilterOption } from "@/shared/lib/db/adapter"

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
    <label style={{ display: "grid", gap: 6, maxWidth: 360 }}>
      <span style={{ fontSize: 13, lineHeight: "18px", color: "#4b5563" }}>선생님 필터</span>
      <select
        value={selectedTeacherId}
        onChange={(event) => handleChange(event.target.value)}
        style={{
          padding: 10,
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "#fff"
        }}
      >
        <option value="all">전체</option>
        {sortedOptions.map((option) => (
          <option key={option.teacherId} value={option.teacherId}>
            {option.teacherName}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, lineHeight: "16px", color: "#6b7280" }}>
        학원 계정(로그인 계정)은 제외하고, active 내부 선생님 프로필만 표시합니다.
      </span>
    </label>
  )
}
