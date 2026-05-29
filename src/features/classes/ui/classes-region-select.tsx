"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"

import { academyAreaOptions, type AcademyArea } from "@/shared/config/academy-areas"

type ClassesRegionSelectProps = {
  selectedRegion: AcademyArea
}

type ClassesSearchInputProps = {
  initialQuery: string
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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  fontSize: 14,
  color: "#111827"
}

export function ClassesSearchInput({ initialQuery }: ClassesSearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const applyQuery = (nextValue: string) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    const normalized = nextValue.trim()
    if (normalized) {
      nextSearchParams.set("q", normalized)
    } else {
      nextSearchParams.delete("q")
    }
    router.replace(`${pathname}?${nextSearchParams.toString()}`)
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
      style={{ display: "grid", gap: 6 }}
    >
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#374151" }}>검색</span>
        <input
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            setValue(nextValue)
            scheduleApply(nextValue)
          }}
          placeholder="과목, 지역으로 검색"
          inputMode="search"
          style={inputStyle}
        />
      </label>
    </form>
  )
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
