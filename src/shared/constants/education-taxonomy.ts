const normalizeText = (value: string | null | undefined) => (value ?? "").trim()

const toKey = (value: string | null | undefined) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·•ㆍ&/(),._-]/g, "")

const LEGACY_HIDDEN_GRADE_BAND_LABELS = {
  preschool: "유아",
  high: "고등"
} as const

type HiddenGradeBandValue = keyof typeof LEGACY_HIDDEN_GRADE_BAND_LABELS

export const SUBJECT_CATEGORIES = [
  { value: "thinking_math", label: "사고력수학" },
  { value: "coding_robot_science", label: "코딩·로봇·과학" },
  { value: "reading_writing", label: "독서논술" },
  { value: "english", label: "영어" },
  { value: "arts", label: "예술" },
  { value: "sports_dance", label: "체육·무용" }
] as const

export type SubjectCategoryValue = (typeof SUBJECT_CATEGORIES)[number]["value"]

export const GRADE_BANDS = [
  { value: "elem_1_2", label: "초1~2" },
  { value: "elem_3_4", label: "초3~4" },
  { value: "elem_5_6", label: "초5~6" },
  { value: "middle", label: "중등" }
] as const

export type GradeBandValue = (typeof GRADE_BANDS)[number]["value"]
export type AnyGradeBandValue = GradeBandValue | HiddenGradeBandValue

export const CHILD_GRADES = [
  { value: "elem_1", label: "초1" },
  { value: "elem_2", label: "초2" },
  { value: "elem_3", label: "초3" },
  { value: "elem_4", label: "초4" },
  { value: "elem_5", label: "초5" },
  { value: "elem_6", label: "초6" },
  { value: "middle_1", label: "중1" },
  { value: "middle_2", label: "중2" },
  { value: "middle_3", label: "중3" }
] as const

export type ChildGradeValue = (typeof CHILD_GRADES)[number]["value"]

export const CHILD_GRADE_TO_BAND = {
  elem_1: "elem_1_2",
  elem_2: "elem_1_2",
  elem_3: "elem_3_4",
  elem_4: "elem_3_4",
  elem_5: "elem_5_6",
  elem_6: "elem_5_6",
  middle_1: "middle",
  middle_2: "middle",
  middle_3: "middle"
} as const satisfies Record<ChildGradeValue, GradeBandValue>

const subjectByValue = new Map<SubjectCategoryValue, (typeof SUBJECT_CATEGORIES)[number]>(
  SUBJECT_CATEGORIES.map((item) => [item.value, item])
)

const gradeBandByValue = new Map<GradeBandValue, (typeof GRADE_BANDS)[number]>(
  GRADE_BANDS.map((item) => [item.value, item])
)

const childGradeByValue = new Map<ChildGradeValue, (typeof CHILD_GRADES)[number]>(
  CHILD_GRADES.map((item) => [item.value, item])
)

const SUBJECT_KEY_TO_VALUE: Record<string, SubjectCategoryValue> = {
  thinkingmath: "thinking_math",
  사고력수학: "thinking_math",
  codingrobotscience: "coding_robot_science",
  코딩로봇과학: "coding_robot_science",
  코딩로봇: "coding_robot_science",
  코딩ai로봇: "coding_robot_science",
  코딩ai: "coding_robot_science",
  codingai: "coding_robot_science",
  codingrobot: "coding_robot_science",
  codingrobots: "coding_robot_science",
  science: "coding_robot_science",
  과학: "coding_robot_science",
  readingwriting: "reading_writing",
  독서논술: "reading_writing",
  국어독서논술: "reading_writing",
  koreanreading: "reading_writing",
  영어: "english",
  english: "english",
  예술: "arts",
  arts: "arts",
  artmusic: "arts",
  미술음악: "arts",
  미술: "arts",
  음악: "arts",
  체육무용: "sports_dance",
  sportsdance: "sports_dance",
  physicaldance: "sports_dance"
}

const LEGACY_SUBJECT_LABELS: Record<string, string> = {
  교과수학: "교과수학",
  schoolmath: "교과수학",
  school_math: "교과수학",
  기타: "기타",
  기타과목: "기타"
}

const GRADE_BAND_KEY_TO_VALUE: Record<string, AnyGradeBandValue> = {
  elem12: "elem_1_2",
  초12: "elem_1_2",
  초등저학년: "elem_1_2",
  elem34: "elem_3_4",
  초34: "elem_3_4",
  초등중학년: "elem_3_4",
  elem56: "elem_5_6",
  초56: "elem_5_6",
  초등고학년: "elem_5_6",
  middle: "middle",
  중등: "middle",
  중학생: "middle",
  preschool: "preschool",
  유아: "preschool",
  high: "high",
  highschool: "high",
  고등: "high",
  고등학생: "high"
}

const CHILD_GRADE_KEY_TO_VALUE: Record<string, ChildGradeValue> = {
  elem1: "elem_1",
  초1: "elem_1",
  초등1: "elem_1",
  초등1학년: "elem_1",
  elem2: "elem_2",
  초2: "elem_2",
  초등2: "elem_2",
  초등2학년: "elem_2",
  elem3: "elem_3",
  초3: "elem_3",
  초등3: "elem_3",
  초등3학년: "elem_3",
  elem4: "elem_4",
  초4: "elem_4",
  초등4: "elem_4",
  초등4학년: "elem_4",
  elem5: "elem_5",
  초5: "elem_5",
  초등5: "elem_5",
  초등5학년: "elem_5",
  elem6: "elem_6",
  초6: "elem_6",
  초등6: "elem_6",
  초등6학년: "elem_6",
  middle1: "middle_1",
  중1: "middle_1",
  중등1: "middle_1",
  중1학년: "middle_1",
  middle2: "middle_2",
  중2: "middle_2",
  중등2: "middle_2",
  중2학년: "middle_2",
  middle3: "middle_3",
  중3: "middle_3",
  중등3: "middle_3",
  중3학년: "middle_3"
}

export const normalizeSubjectCategory = (value: string | null | undefined): SubjectCategoryValue | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return SUBJECT_KEY_TO_VALUE[toKey(normalized)] ?? null
}

export const normalizeGradeBand = (value: string | null | undefined): AnyGradeBandValue | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return GRADE_BAND_KEY_TO_VALUE[toKey(normalized)] ?? null
}

export const normalizeChildGrade = (value: string | null | undefined): ChildGradeValue | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return CHILD_GRADE_KEY_TO_VALUE[toKey(normalized)] ?? null
}

export const getSubjectLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const category = normalizeSubjectCategory(normalized)
  if (category) {
    return subjectByValue.get(category)?.label ?? normalized
  }

  return LEGACY_SUBJECT_LABELS[normalized] ?? LEGACY_SUBJECT_LABELS[toKey(normalized)] ?? normalized
}

export const getGradeBandLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const band = normalizeGradeBand(normalized)
  if (band === "preschool" || band === "high") {
    return LEGACY_HIDDEN_GRADE_BAND_LABELS[band]
  }
  if (band) {
    return gradeBandByValue.get(band)?.label ?? normalized
  }

  return normalized
}

export const getChildGradeLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const childGrade = normalizeChildGrade(normalized)
  if (childGrade) {
    return childGradeByValue.get(childGrade)?.label ?? normalized
  }

  return normalized
}

export const getGradeBandFromChildGrade = (value: string | null | undefined): GradeBandValue | null => {
  const childGrade = normalizeChildGrade(value)
  if (!childGrade) {
    return null
  }

  return CHILD_GRADE_TO_BAND[childGrade]
}
