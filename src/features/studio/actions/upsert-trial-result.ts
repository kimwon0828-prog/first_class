"use server"

import { revalidatePath } from "next/cache"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  TRIAL_RESULT_REGISTRATION_OPTIONS,
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS
} from "@/features/studio/lib/trial-result-options"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

export type UpsertTrialResultActionState = {
  status: "idle" | "error" | "success"
  message: string
  mode?: "created" | "updated"
  successToken?: string | null
}

const defaultState: UpsertTrialResultActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const REGISTRATION_STATUS_VALUES = new Set(
  TRIAL_RESULT_REGISTRATION_OPTIONS.map((item) => item.value)
)
const UNREGISTERED_REASON_VALUES = new Set(
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.map((item) => item.value)
)

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const normalizeObservationValues = (values: FormDataEntryValue[]) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )

const normalizeRegistrationStatus = (
  value: FormDataEntryValue | null
): ApplicationRegistrationStatus | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  return REGISTRATION_STATUS_VALUES.has(value as ApplicationRegistrationStatus)
    ? (value as ApplicationRegistrationStatus)
    : null
}

const normalizeUnregisteredReason = (
  value: FormDataEntryValue | null
): ApplicationUnregisteredReason | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  return UNREGISTERED_REASON_VALUES.has(value as ApplicationUnregisteredReason)
    ? (value as ApplicationUnregisteredReason)
    : null
}

const areObservationListsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return sortedLeft.every((item, index) => item === sortedRight[index])
}

const getChangedFieldLabels = (
  current: StudioApplicationDetail,
  nextValue: {
    observations: string[]
    recommendedCourse: string | null
    recommendedLevel: string | null
    recommendedSchedule: string | null
    registrationStatus: ApplicationRegistrationStatus
    unregisteredReason: ApplicationUnregisteredReason | null
    unregisteredReasonNote: string | null
    note: string | null
  }
) => {
  const currentResult = current.trialResult
  if (!currentResult) {
    const initialFields: string[] = []

    if (nextValue.observations.length > 0) {
      initialFields.push("수업 관찰")
    }

    if (nextValue.recommendedCourse) {
      initialFields.push("추천 과정")
    }

    if (nextValue.recommendedLevel) {
      initialFields.push("추천 레벨")
    }

    if (nextValue.recommendedSchedule) {
      initialFields.push("추천 일정")
    }

    if (current.registrationStatus !== nextValue.registrationStatus) {
      initialFields.push("등록 전환")
    }

    if (nextValue.unregisteredReason) {
      initialFields.push("미등록 사유")
    }

    if (nextValue.unregisteredReasonNote) {
      initialFields.push("기타 사유 메모")
    }

    if (nextValue.note) {
      initialFields.push("체험 메모")
    }

    return initialFields
  }

  const changes: string[] = []

  if (!areObservationListsEqual(currentResult.observations, nextValue.observations)) {
    changes.push("수업 관찰")
  }

  if (currentResult.recommendedCourse !== nextValue.recommendedCourse) {
    changes.push("추천 과정")
  }

  if (currentResult.recommendedLevel !== nextValue.recommendedLevel) {
    changes.push("추천 레벨")
  }

  if (currentResult.recommendedSchedule !== nextValue.recommendedSchedule) {
    changes.push("추천 일정")
  }

  if (current.registrationStatus !== nextValue.registrationStatus) {
    changes.push("등록 전환")
  }

  if (current.unregisteredReason !== nextValue.unregisteredReason) {
    changes.push("미등록 사유")
  }

  if (current.unregisteredReasonNote !== nextValue.unregisteredReasonNote) {
    changes.push("기타 사유 메모")
  }

  if (currentResult.note !== nextValue.note) {
    changes.push("체험 메모")
  }

  return changes
}

export async function upsertTrialResultAction(
  applicationId: string,
  previousState: UpsertTrialResultActionState = defaultState,
  formData: FormData
): Promise<UpsertTrialResultActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const { data: current, error } = await getStudioApplicationDetail(applicationId, teacher.organizationId)

  if (error || !current) {
    return {
      status: "error",
      message: "조회 가능한 신청이 아니거나 신청 정보를 불러오지 못했습니다."
    }
  }

  if (current.status !== "completed") {
    return {
      status: "error",
      message: "체험 완료 후에만 결과를 기록할 수 있습니다."
    }
  }

  const nextValue = {
    observations: normalizeObservationValues(formData.getAll("observations")),
    recommendedCourse: normalizeOptionalText(formData.get("recommendedCourse")),
    recommendedLevel: normalizeOptionalText(formData.get("recommendedLevel")),
    recommendedSchedule: normalizeOptionalText(formData.get("recommendedSchedule")),
    registrationStatus: normalizeRegistrationStatus(formData.get("registrationStatus")),
    unregisteredReason: normalizeUnregisteredReason(formData.get("unregisteredReason")),
    unregisteredReasonNote: normalizeOptionalText(formData.get("unregisteredReasonNote")),
    note: normalizeOptionalText(formData.get("note")),
    parentReaction: current.trialResult?.parentReaction ?? null,
    nextAction: current.trialResult?.nextAction ?? null
  }

  if (!nextValue.registrationStatus) {
    return {
      status: "error",
      message: "등록 전환 값이 올바르지 않습니다."
    }
  }

  if (formData.get("unregisteredReason") && !nextValue.unregisteredReason) {
    return {
      status: "error",
      message: "미등록 사유 값이 올바르지 않습니다."
    }
  }

  if (nextValue.registrationStatus === "not_enrolled" && !nextValue.unregisteredReason) {
    return {
      status: "error",
      message: "미등록 사유를 선택해 주세요."
    }
  }

  if (
    nextValue.registrationStatus === "not_enrolled" &&
    nextValue.unregisteredReason === "other" &&
    !nextValue.unregisteredReasonNote
  ) {
    return {
      status: "error",
      message: "기타 사유를 입력해 주세요."
    }
  }

  const registrationStatus = nextValue.registrationStatus
  const changedFieldLabels = getChangedFieldLabels(current, {
    ...nextValue,
    registrationStatus
  })
  let outcomeSaved = false

  try {
    await dataAdapter.updateStudioApplicationOutcome({
      applicationId,
      actorId: teacher.id,
      currentStatus: current.status,
      previousRegistrationStatus: current.registrationStatus,
      previousLostAt: current.lostAt,
      consultationNote: current.consultationNote,
      trialFeedback: current.trialFeedback,
      registeredCourse: nextValue.recommendedCourse,
      finalLevel: nextValue.recommendedLevel,
      finalSchedule: nextValue.recommendedSchedule,
      followUpNote: current.followUpNote,
      registrationStatus,
      unregisteredReason:
        registrationStatus === "not_enrolled" ? nextValue.unregisteredReason : null,
      unregisteredReasonNote:
        registrationStatus === "not_enrolled" ? nextValue.unregisteredReasonNote : null,
      note: "체험 결과에서 등록 전환을 저장했습니다."
    })
    outcomeSaved = true

    const mode = await dataAdapter.upsertStudioTrialResult({
      applicationId,
      actorId: teacher.id,
      observations: nextValue.observations,
      parentReaction: nextValue.parentReaction,
      recommendedCourse: nextValue.recommendedCourse,
      recommendedLevel: nextValue.recommendedLevel,
      recommendedSchedule: nextValue.recommendedSchedule,
      note: nextValue.note,
      nextAction: nextValue.nextAction
    })

    if (current.registrationStatus !== "enrolled" && registrationStatus === "enrolled") {
      const updated = await dataAdapter
        .getStudioApplicationDetail(applicationId, teacher.organizationId)
        .catch(() => null)

      if (updated) {
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "parent",
          eventType: "trial_enrolled"
        })
      }
    }

    revalidatePath("/studio")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    const suffix =
      changedFieldLabels.length > 0 ? ` (${changedFieldLabels.join(", ")})` : ""

    return {
      status: "success",
      message:
        mode === "created"
          ? `체험 결과를 기록했습니다${suffix}.`
          : `체험 결과를 수정했습니다${suffix}.`,
      mode,
      successToken: crypto.randomUUID()
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_upsert_trial_result"

    if (outcomeSaved) {
      return {
        status: "error",
        message: "등록 전환은 저장되었을 수 있지만 체험 결과 저장에 실패했습니다. 새로고침 후 다시 저장해 주세요."
      }
    }

    if (message === "failed_to_check_trial_result") {
      return {
        status: "error",
        message: "기존 체험 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "체험 결과 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
