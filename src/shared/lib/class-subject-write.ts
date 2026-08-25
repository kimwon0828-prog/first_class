export type ClassSubjectWritePayload = {
  subject: string
  subject_category_id?: string | null
  subject_id?: string | null
}

export const SAFE_LEGACY_SUBJECT_MASTER_CODES = {
  thinking_math: "thinking_math",
  english: "english"
} as const

export type LegacySubjectChangeDecision =
  | { action: "preserve" }
  | {
      action: "map"
      subjectCode: (typeof SAFE_LEGACY_SUBJECT_MASTER_CODES)[keyof typeof SAFE_LEGACY_SUBJECT_MASTER_CODES]
    }
  | { action: "clear" }

export const resolveLegacySubjectChange = ({
  existingSubject,
  nextSubject
}: {
  existingSubject: string
  nextSubject: string
}): LegacySubjectChangeDecision => {
  const normalizedExistingSubject = existingSubject.trim()
  const normalizedNextSubject = nextSubject.trim()

  if (normalizedExistingSubject === normalizedNextSubject) {
    return { action: "preserve" }
  }

  const safeSubjectCode =
    SAFE_LEGACY_SUBJECT_MASTER_CODES[
      normalizedNextSubject as keyof typeof SAFE_LEGACY_SUBJECT_MASTER_CODES
    ]

  return safeSubjectCode
    ? { action: "map", subjectCode: safeSubjectCode }
    : { action: "clear" }
}

export const buildClassSubjectWritePayload = ({
  legacySubject,
  masterCategory,
  masterSubject,
  legacySubjectCategoryId,
  legacySubjectId
}: {
  legacySubject: string | null | undefined
  masterCategory: { id: string; code: string } | null
  masterSubject: { id: string; code: string; categoryId: string } | null
  legacySubjectCategoryId?: string | null
  legacySubjectId?: string | null
}): ClassSubjectWritePayload => {
  if (masterCategory) {
    if (masterSubject && masterSubject.categoryId !== masterCategory.id) {
      throw new Error("subject_category_mismatch")
    }

    return {
      subject_category_id: masterCategory.id,
      subject_id: masterSubject?.id ?? null,
      subject: masterSubject?.code ?? masterCategory.code
    }
  }

  const subject = legacySubject?.trim() ?? ""
  if (!subject) {
    throw new Error("invalid_legacy_subject")
  }

  return {
    subject,
    ...(legacySubjectCategoryId !== undefined
      ? { subject_category_id: legacySubjectCategoryId }
      : {}),
    ...(legacySubjectId !== undefined ? { subject_id: legacySubjectId } : {})
  }
}
