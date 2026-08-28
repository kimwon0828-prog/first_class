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

// teacher_public_profiles view 는 공개 OFF 항목을 NULL 로 마스킹할 뿐 row 자체는 계속 반환한다.
// 따라서 "row 가 있다 = 공개" 가 아니다. 공개 가능한 항목이 전부 비어 있으면 공개 프로필이 없는 것으로 본다.
// specialty / career_years 는 view 가 마스킹하지 않고 학부모 화면에서도 쓰지 않으므로 판단에서 제외한다.
type TeacherPublicProfileFields = {
  teacherName: string | null
  intro: string | null
  subjects: string | null
  targetStudents: string | null
  specialties: string | null
  shortIntro: string | null
  teachingStyle: string | null
}

export const hasVisibleTeacherPublicProfile = (profile: TeacherPublicProfileFields) =>
  [
    profile.teacherName,
    profile.intro,
    profile.subjects,
    profile.targetStudents,
    profile.specialties,
    profile.shortIntro,
    profile.teachingStyle
  ].some((value) => Boolean(value?.trim()))
