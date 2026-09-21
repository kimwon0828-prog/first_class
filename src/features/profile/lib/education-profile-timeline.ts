import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import type { EducationProfileExperience } from "./education-profile"

export function groupEducationExperiences(experiences: readonly EducationProfileExperience[]) {
  const groups = new Map<string, { key: string; label: string; experiences: EducationProfileExperience[] }>()
  for (const experience of experiences) {
    const parts = getSeoulDateTimeParts(experience.experienceDate)
    const key = parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}` : "undated"
    const group = groups.get(key) ?? { key, label: parts ? `${parts.year}년 ${parts.month}월` : "날짜 미기록", experiences: [] }
    group.experiences.push(experience)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function educationExperienceDateLabel(value: string): string | null {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) return null
  return `${parts.month}월 ${parts.day}일 (${["일", "월", "화", "수", "목", "금", "토"][parts.weekday]})`
}
