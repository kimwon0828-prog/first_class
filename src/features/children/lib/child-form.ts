export const normalizeOptionalText = (value: FormDataEntryValue | null, maxLength: number) => {
  const text = String(value ?? "").trim()

  if (!text) {
    return null
  }

  return text.slice(0, maxLength)
}

export const validateChildProfileForm = (formData: FormData) => {
  const name = String(formData.get("name") ?? "").trim()
  const grade = String(formData.get("grade") ?? "").trim()
  const schoolName = normalizeOptionalText(formData.get("schoolName"), 60)
  const notes = normalizeOptionalText(formData.get("notes"), 500)
  const currentLevel = normalizeOptionalText(formData.get("currentLevel"), 120)
  const interestSubjects = normalizeOptionalText(formData.get("interestSubjects"), 120)
  const goalNote = normalizeOptionalText(formData.get("goalNote"), 500)

  if (!name || name.length < 2) {
    return { ok: false as const, message: "학생명은 2자 이상 입력해 주세요." }
  }

  if (!grade) {
    return { ok: false as const, message: "나이를 선택해 주세요." }
  }

  return {
    ok: true as const,
    input: {
      name: name.slice(0, 30),
      grade: grade.slice(0, 30),
      schoolName,
      notes,
      currentLevel,
      interestSubjects,
      goalNote
    }
  }
}
