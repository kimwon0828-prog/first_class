import { getSubjectLabel } from "@/shared/constants/education-taxonomy"

export type SubjectCategory = {
  id: string
  code: string
  name: string
  sortOrder: number
}

export type Subject = {
  id: string
  code: string
  name: string
  categoryId: string
  categoryCode: string
  categoryName: string
  sortOrder: number
}

export type SubjectCatalogCategory = SubjectCategory & {
  subjects: Subject[]
}

const SUBJECT_CATEGORY_LABEL_BY_CODE: Record<string, string> = {
  korean_language: "국어·논술",
  math: "수학",
  english: "영어",
  science: "과학",
  social_history: "사회·역사",
  coding_it_robotics: "코딩·IT·로봇",
  foreign_language: "외국어",
  music: "음악",
  art_design: "미술·디자인",
  sports_dance: "체육·무용",
  creative_mind: "창의·두뇌",
  other: "기타"
}

export const findSubjectCatalogCategory = (
  catalog: SubjectCatalogCategory[],
  categoryId: string | null | undefined
) => catalog.find((category) => category.id === categoryId) ?? null

export const findSubjectCatalogSelection = (
  catalog: SubjectCatalogCategory[],
  subjectId: string | null | undefined
): { category: SubjectCatalogCategory; subject: Subject } | null => {
  if (!subjectId) {
    return null
  }

  for (const category of catalog) {
    const subject = category.subjects.find((item) => item.id === subjectId)
    if (subject) {
      return { category, subject }
    }
  }

  return null
}

export type ClassSubjectReadModel = {
  subjectCategoryId: string | null
  subjectCategoryCode: string | null
  subjectCategoryName: string | null
  subjectId: string | null
  subjectCode: string | null
  subjectName: string | null
}

export const buildClassSubjectReadModel = ({
  subjectCategoryId,
  masterCategory,
  subjectId,
  masterSubject
}: {
  subjectCategoryId: string | null | undefined
  masterCategory: SubjectCategory | null | undefined
  subjectId: string | null | undefined
  masterSubject: Subject | null | undefined
}): ClassSubjectReadModel => ({
  subjectCategoryId:
    subjectCategoryId ?? masterCategory?.id ?? masterSubject?.categoryId ?? null,
  subjectCategoryCode: masterCategory?.code ?? masterSubject?.categoryCode ?? null,
  subjectCategoryName: masterCategory?.name ?? masterSubject?.categoryName ?? null,
  subjectId: subjectId ?? masterSubject?.id ?? null,
  subjectCode: masterSubject?.code ?? null,
  subjectName: masterSubject?.name ?? null
})

export type ClassSubjectDisplayInput = ClassSubjectReadModel & {
  subject: string | null | undefined
}

export type ClassSubjectDisplay = {
  source: "master" | "legacy"
  categoryLabel: string | null
  subjectLabel: string | null
}

export const resolveClassSubjectDisplay = (
  input: ClassSubjectDisplayInput
): ClassSubjectDisplay => {
  const categoryLabel = input.subjectCategoryName?.trim() || null
  const subjectLabel = input.subjectName?.trim() || null

  if (input.subjectCategoryId && categoryLabel) {
    return {
      source: "master",
      categoryLabel,
      subjectLabel: input.subjectId ? subjectLabel : null
    }
  }

  const legacySubject = input.subject?.trim() ?? ""

  return {
    source: "legacy",
    categoryLabel: null,
    subjectLabel:
      SUBJECT_CATEGORY_LABEL_BY_CODE[legacySubject] ?? getSubjectLabel(legacySubject)
  }
}

export const formatClassSubjectDisplayLabel = (
  input: ClassSubjectDisplayInput
) => {
  const display = resolveClassSubjectDisplay(input)
  return Array.from(
    new Set([display.categoryLabel, display.subjectLabel].filter((label): label is string => Boolean(label)))
  ).join(" · ")
}
