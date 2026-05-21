"use server"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { dataAdapter } from "@/shared/lib/db"

export type CreateTrialApplicationActionState = {
  status: "idle" | "error" | "success"
  message: string
  redirectTo?: string
}

const defaultState: CreateTrialApplicationActionState = {
  status: "idle",
  message: ""
}

const validateForm = (formData: FormData) => {
  const childName = String(formData.get("childName") ?? "").trim()
  const childGrade = String(formData.get("childGrade") ?? "").trim()
  const parentName = String(formData.get("parentName") ?? "").trim()
  const parentPhone = String(formData.get("parentPhone") ?? "").trim()
  const childSchoolRaw = String(formData.get("childSchool") ?? "").trim()
  const childNotesRaw = String(formData.get("childNotes") ?? "").trim()
  const subjectExperienceYnRaw = String(formData.get("subjectExperienceYn") ?? "").trim()
  const subjectExperienceDurationRaw = String(formData.get("subjectExperienceDuration") ?? "").trim()
  const currentLevelRaw = String(formData.get("currentLevel") ?? "").trim()
  const preferredRegularScheduleRaw = String(formData.get("preferredRegularSchedule") ?? "").trim()
  const goalTypeRaw = String(formData.get("goalType") ?? "").trim()
  const goalNoteRaw = String(formData.get("goalNote") ?? "").trim()
  const selectedScheduleBlockId = String(formData.get("selectedScheduleBlockId") ?? "").trim()
  const memoRaw = String(formData.get("memo") ?? "").trim()
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

  if (!parentName || parentName.length < 2) {
    return { ok: false as const, message: "보호자 이름은 2자 이상 입력해 주세요." }
  }

  if (!parentPhone || parentPhone.length < 8) {
    return { ok: false as const, message: "보호자 연락처를 입력해 주세요." }
  }

  if (!selectedScheduleBlockId) {
    return { ok: false as const, message: "예약 가능 시간대를 선택해 주세요." }
  }

  return {
    ok: true as const,
    childName,
    childGrade,
    parentName,
    parentPhone,
    childSchool,
    childNotes,
    subjectExperienceYn,
    subjectExperienceDuration,
    currentLevel,
    preferredRegularSchedule,
    goalType,
    goalNote,
    selectedScheduleBlockId,
    memo
  }
}

export async function createTrialApplicationAction(
  classId: string,
  previousState: CreateTrialApplicationActionState = defaultState,
  formData: FormData
): Promise<CreateTrialApplicationActionState> {
  void previousState

  const session = await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    return {
      status: "error",
      message: "학부모 계정만 체험 신청할 수 있습니다."
    }
  }

  const classItem = await dataAdapter.getClassById(classId)
  if (!classItem) {
    return {
      status: "error",
      message: "신청할 수업 정보를 찾을 수 없습니다."
    }
  }

  const validated = validateForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  try {
    const availableSlots = await dataAdapter.listAvailableScheduleSlotsByClassId(classId)
    const selectedSlot =
      availableSlots.find((slot) => slot.id === validated.selectedScheduleBlockId) ?? null

    if (!selectedSlot) {
      return {
        status: "error",
        message: "선택한 시간대가 만료되었거나 더 이상 예약할 수 없습니다. 다시 선택해 주세요."
      }
    }

    if (selectedSlot.isClosed || selectedSlot.appliedCount >= selectedSlot.capacity) {
      return {
        status: "error",
        message: "방금 마감되었습니다. 다른 시간대를 선택해 주세요."
      }
    }

    await dataAdapter.createTrialApplication({
      parentId: session.user.id,
      classId,
      childName: validated.childName,
      childGrade: validated.childGrade,
      parentName: validated.parentName,
      parentPhone: validated.parentPhone,
      childSchool: validated.childSchool,
      childNotes: validated.childNotes,
      subjectExperienceYn: validated.subjectExperienceYn,
      subjectExperienceDuration: validated.subjectExperienceDuration,
      currentLevel: validated.currentLevel,
      preferredRegularSchedule: validated.preferredRegularSchedule,
      goalType: validated.goalType,
      goalNote: validated.goalNote,
      selectedScheduleBlockId: validated.selectedScheduleBlockId,
      memo: validated.memo
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed_to_create_trial_application"

    if (message === "duplicate_trial_application") {
      return {
        status: "error",
        message: "같은 희망 시간으로 이미 신청한 내역이 있습니다."
      }
    }

    if (message === "failed_to_create_application_log") {
      return {
        status: "error",
        message:
          "신청은 접수되었지만 이력 기록 중 문제가 발생했습니다. 잠시 후 내 신청에서 상태를 확인해 주세요."
      }
    }

    if (message === "invalid_schedule_slot") {
      return {
        status: "error",
        message: "선택한 시간대가 만료되었거나 더 이상 예약할 수 없습니다. 다시 선택해 주세요."
      }
    }

    if (message === "slot_capacity_reached") {
      return {
        status: "error",
        message: "방금 마감되었습니다. 다른 시간대를 선택해 주세요."
      }
    }

    return {
      status: "error",
      message: "체험 신청에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  return {
    status: "success",
    message: "체험 신청이 완료되었습니다.",
    redirectTo: "/my/applications"
  }
}
