"use server"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
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

type ClassOrganizationRow = {
  organization_id: string
}

const validateForm = (formData: FormData) => {
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

export async function createTrialApplicationAction(
  classId: string,
  previousState: CreateTrialApplicationActionState = defaultState,
  formData: FormData
): Promise<CreateTrialApplicationActionState> {
  void previousState

  const session = await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile) {
    return {
      status: "error",
      message: "신청 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (profile.role !== "parent") {
    return {
      status: "error",
      message: "학원 계정은 체험수업을 신청할 수 없어요. 수업 관리는 스튜디오에서 진행해주세요.",
      redirectTo: "/studio"
    }
  }

  const classItem = await dataAdapter.getClassById(classId)
  if (!classItem) {
    return {
      status: "error",
      message: "신청할 프로그램 정보를 찾을 수 없습니다."
    }
  }

  const validated = validateForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const resolvedParentName = profile.name.trim()
  const resolvedParentPhone = profile.phone?.trim() ?? null

  if (!resolvedParentPhone || resolvedParentPhone.length < 8) {
    return {
      status: "error",
      message: "체험수업 신청을 위해 연락처 정보가 필요합니다."
    }
  }

  try {
    let validatedChildId: string | null = null

    if (validated.childId) {
      const myChildren = await dataAdapter.listMyChildren(profile.id)
      const matchedChild = myChildren.find((child) => child.id === validated.childId) ?? null

      if (!matchedChild) {
        return {
          status: "error",
          message: "선택한 자녀 정보를 확인할 수 없습니다. 다시 선택해 주세요."
        }
      }

      validatedChildId = matchedChild.id
    }

    const availableSlots = await dataAdapter.listAvailableScheduleSlotsByClassId(classId)
    const selectedSlot =
      availableSlots.find((slot) => slot.optionId === validated.selectedScheduleOptionId) ?? null

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

    const createdApplication = await dataAdapter.createTrialApplication({
      parentId: session.user.id,
      classId,
      childId: validatedChildId,
      childName: validated.childName,
      childGrade: validated.childGrade,
      parentName: resolvedParentName,
      parentPhone: resolvedParentPhone,
      childSchool: validated.childSchool,
      childNotes: validated.childNotes,
      subjectExperienceYn: validated.subjectExperienceYn,
      subjectExperienceDuration: validated.subjectExperienceDuration,
      currentLevel: validated.currentLevel,
      preferredRegularSchedule: validated.preferredRegularSchedule,
      goalType: validated.goalType,
      goalNote: validated.goalNote,
      selectedScheduleOptionId: validated.selectedScheduleOptionId,
      memo: validated.memo
    })

    const supabase = await getSupabaseServerClient()
    const { data: classRow } = await supabase
      .from("classes")
      .select("organization_id")
      .eq("id", classId)
      .maybeSingle<ClassOrganizationRow>()

    if (classRow?.organization_id) {
      await logSmsEventSafely({
        organizationId: classRow.organization_id,
        application: {
          id: createdApplication.id,
          classId: createdApplication.classId,
          parentId: createdApplication.parentId,
          childName: createdApplication.childName,
          parentName: createdApplication.parentName,
          parentPhone: createdApplication.parentPhone,
          classTitle: createdApplication.classTitle ?? classItem.title,
          requestedSlotAt: createdApplication.requestedSlotAt,
          confirmedSlotAt: createdApplication.confirmedSlotAt,
          selectedScheduleLabel: createdApplication.selectedScheduleLabel ?? null,
          assignedTeacherId: classItem.teacherId,
          assignedTeacherName: classItem.teacherName
        },
        createdBy: session.user.id,
        recipientType: "teacher",
        eventType: "teacher_trial_requested"
      })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed_to_create_trial_application"

    if (message === "duplicate_trial_application") {
      return {
        status: "error",
        message: "같은 희망 시간으로 이미 신청한 내역이 있습니다."
      }
    }

    if (message === "invalid_schedule_slot") {
      return {
        status: "error",
        message: "선택한 시간대가 만료되었거나 더 이상 예약할 수 없습니다. 다시 선택해 주세요."
      }
    }

    if (message === "missing_class_teacher_for_application") {
      return {
        status: "error",
        message:
          "담당 선생님 정보가 없는 수업이라 체험 신청을 진행할 수 없습니다. 수업 담당 선생님을 먼저 지정해주세요."
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
      message: "신청에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  return {
    status: "success",
    message: "신청이 접수되었습니다. 내 신청에서 진행 상태를 확인할 수 있어요.",
    redirectTo: "/my/applications"
  }
}
