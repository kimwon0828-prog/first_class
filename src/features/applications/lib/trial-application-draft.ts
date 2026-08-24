export const TRIAL_APPLICATION_DRAFT_STORAGE_KEY = "firstsuup_trial_application_draft"
export const TRIAL_APPLICATION_DRAFT_TTL_MS = 30 * 60 * 1000

export type TrialApplicationDraft = {
  classId: string
  selectedScheduleOptionId: string
  savedAt: number
}

const removeStoredDraft = () => {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.removeItem(TRIAL_APPLICATION_DRAFT_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private browsing or restricted environments.
  }
}

const parseStoredDraft = (raw: string | null, now: number): TrialApplicationDraft | null => {
  if (!raw) {
    return null
  }

  try {
    const value = JSON.parse(raw) as Partial<TrialApplicationDraft>
    const classId = typeof value.classId === "string" ? value.classId.trim() : ""
    const selectedScheduleOptionId =
      typeof value.selectedScheduleOptionId === "string" ? value.selectedScheduleOptionId.trim() : ""
    const savedAt = typeof value.savedAt === "number" ? value.savedAt : Number.NaN

    if (
      !classId ||
      !selectedScheduleOptionId ||
      !Number.isFinite(savedAt) ||
      savedAt > now ||
      now - savedAt > TRIAL_APPLICATION_DRAFT_TTL_MS
    ) {
      return null
    }

    return { classId, selectedScheduleOptionId, savedAt }
  } catch {
    return null
  }
}

export const saveTrialApplicationDraft = (
  input: Pick<TrialApplicationDraft, "classId" | "selectedScheduleOptionId">
) => {
  if (typeof window === "undefined") {
    return
  }

  const classId = input.classId.trim()
  const selectedScheduleOptionId = input.selectedScheduleOptionId.trim()
  if (!classId || !selectedScheduleOptionId) {
    removeStoredDraft()
    return
  }

  const draft: TrialApplicationDraft = {
    classId,
    selectedScheduleOptionId,
    savedAt: Date.now()
  }

  try {
    window.localStorage.setItem(TRIAL_APPLICATION_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Login can still proceed when storage is unavailable.
  }
}

export const getTrialApplicationDraft = (classId: string, now = Date.now()) => {
  if (typeof window === "undefined") {
    return null
  }

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(TRIAL_APPLICATION_DRAFT_STORAGE_KEY)
  } catch {
    return null
  }

  const draft = parseStoredDraft(raw, now)
  if (!draft || draft.classId !== classId) {
    removeStoredDraft()
    return null
  }

  return draft
}

export const clearTrialApplicationDraft = removeStoredDraft
