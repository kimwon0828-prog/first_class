export const TEACHER_PUBLIC_VISIBILITY_KEYS = [
  "name",
  "intro",
  "subjects",
  "targetStudents",
  "specialties",
  "shortIntro",
  "teachingStyle"
] as const

export type TeacherPublicVisibilityKey = (typeof TEACHER_PUBLIC_VISIBILITY_KEYS)[number]

export type TeacherPublicVisibility = Record<TeacherPublicVisibilityKey, boolean>

export const DEFAULT_TEACHER_PUBLIC_VISIBILITY: TeacherPublicVisibility = {
  name: true,
  intro: true,
  subjects: true,
  targetStudents: true,
  specialties: true,
  shortIntro: true,
  teachingStyle: true
}

const toBooleanOrNull = (value: unknown) => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true
    }

    if (value === "false") {
      return false
    }
  }

  return null
}

export const normalizeTeacherPublicVisibility = (value: unknown): TeacherPublicVisibility => {
  const normalized: TeacherPublicVisibility = { ...DEFAULT_TEACHER_PUBLIC_VISIBILITY }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized
  }

  for (const key of TEACHER_PUBLIC_VISIBILITY_KEYS) {
    const nextValue = toBooleanOrNull((value as Record<string, unknown>)[key])
    if (nextValue !== null) {
      normalized[key] = nextValue
    }
  }

  return normalized
}

export const toTeacherPublicVisibilityJson = (visibility: TeacherPublicVisibility) =>
  JSON.stringify(visibility)
