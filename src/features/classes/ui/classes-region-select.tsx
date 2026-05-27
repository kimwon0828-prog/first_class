"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"

import { academyAreaOptions, type AcademyArea } from "@/shared/config/academy-areas"

type ClassesRegionSelectProps = {
  selectedRegion: AcademyArea
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

export function ClassesRegionSelect({ selectedRegion }: ClassesRegionSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleChange = (nextRegion: AcademyArea) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.set("region", nextRegion)
    router.push(`${pathname}?${nextSearchParams.toString()}`)
  }

  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 14, color: "#374151" }}>지역</span>
      <select
        aria-label="학원가 선택"
        value={selectedRegion}
        onChange={(event) => handleChange(event.target.value as AcademyArea)}
        style={selectStyle}
      >
        {academyAreaOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
