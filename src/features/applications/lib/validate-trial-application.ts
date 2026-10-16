export const validateTrialApplicationForm = (formData: FormData) => {
  const childIdRaw = String(formData.get("childId") ?? "").trim()
  const childName = String(formData.get("childName") ?? "").trim()
  const childGrade = String(formData.get("childGrade") ?? "").trim()
  const childSchoolRaw = String(formData.get("childSchool") ?? "").trim()
  const childNotesRaw = String(formData.get("childNotes") ?? "").trim()
  const subjectExperienceYnRaw = String(formData.get("subjectExperienceYn") ?? "").trim()
  const subjectExperienceDurationRaw = String(formData.get("subjectExperienceDuration") ?? "").trim()
  const currentLevelRaw = String(formData.get("currentLevel") ?? "").trim()
  const preferredRegularScheduleRaw = String(formData.get("preferredRegularSchedule") ?? "").trim()
  const goalTypeRaw = String(formData.get("goalType") ?? "").trim()
  const goalNoteRaw = String(formData.get("goalNote") ?? "").trim()
  const selectedScheduleOptionId = String(formData.get("selectedScheduleOptionId") ?? "").trim()
  const memoRaw = String(formData.get("memo") ?? "").trim()
  const privacyAgreed = String(formData.get("privacyAgreed") ?? "") === "yes"
  const thirdPartyAgreed = String(formData.get("thirdPartyAgreed") ?? "") === "yes"
  const guardianAgreed = String(formData.get("guardianAgreed") ?? "") === "yes"
  const childSchool = childSchoolRaw.length > 0 ? childSchoolRaw : null
  const childNotes = childNotesRaw.length > 0 ? childNotesRaw : null
  const subjectExperienceDuration =
    subjectExperienceDurationRaw.length > 0 ? subjectExperienceDurationRaw : null
  const currentLevel = currentLevelRaw.length > 0 ? currentLevelRaw : null
  const preferredRegularSchedule =
    preferredRegularScheduleRaw.length > 0 ? preferredRegularScheduleRaw : null
  const goalType = goalTypeRaw.length > 0 ? goalTypeRaw : null
  const goalNote = goalNoteRaw.length > 0 ? goalNoteRaw : null
  const memo = memoRaw.length > 0 ? memoRaw : null
  const childId = childIdRaw.length > 0 ? childIdRaw : null
  const subjectExperienceYn =
    subjectExperienceYnRaw === "yes"
      ? true
      : subjectExperienceYnRaw === "no"
        ? false
        : null

  if (!childName || childName.length < 2) {
    return { ok: false as const, message: "자녀 이름은 2자 이상 입력해 주세요." }
  }

  if (!childGrade || childGrade.length < 1) {
    return { ok: false as const, message: "학년을 선택해 주세요." }
  }

  if (!selectedScheduleOptionId) {
    return { ok: false as const, message: "예약 가능 시간대를 선택해 주세요." }
  }

  if (!privacyAgreed || !thirdPartyAgreed || !guardianAgreed) {
    return {
      ok: false as const,
      message: "체험수업 신청에 필요한 필수 동의 항목을 확인해주세요."
    }
  }

  return {
    ok: true as const,
    childId,
    childName,
    childGrade,
    childSchool,
    childNotes,
    subjectExperienceYn,
    subjectExperienceDuration,
    currentLevel,
    preferredRegularSchedule,
    goalType,
    goalNote,
    selectedScheduleOptionId,
    memo
  }
}

