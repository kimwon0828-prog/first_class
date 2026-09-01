"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { parseSeoulDateTimeLocalToIso } from "@/features/studio/lib/seoul-datetime"
import {
  TRIAL_RESULT_REGISTRATION_OPTIONS,
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS
} from "@/features/studio/lib/trial-result-options"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  ConsultationLogChannel,
  ConsultationLogNextAction,
  ConsultationSentiment,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

export type CreateConsultationLogActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
}

const defaultState: CreateConsultationLogActionState = {
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
const CHANNEL_VALUES = new Set<ConsultationLogChannel>(["PHONE", "KAKAO", "SMS", "VISIT", "OTHER"])
const SENTIMENT_VALUES = new Set<ConsultationSentiment>(["POSITIVE", "NEUTRAL", "NEGATIVE"])

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

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

const normalizeChannel = (value: FormDataEntryValue | null): ConsultationLogChannel | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  return CHANNEL_VALUES.has(value as ConsultationLogChannel) ? (value as ConsultationLogChannel) : null
}

const normalizeSentiment = (value: FormDataEntryValue | null): ConsultationSentiment | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  return SENTIMENT_VALUES.has(value as ConsultationSentiment) ? (value as ConsultationSentiment) : null
}

const resolveConsultationNextAction = (
  registrationStatus: ApplicationRegistrationStatus,
  nextContactAt: string | null
): ConsultationLogNextAction => {
  if (registrationStatus === "enrolled") {
    return "REGISTER"
  }

  if (registrationStatus === "not_enrolled") {
    return "LOST"
  }

  if (nextContactAt) {
    return "FOLLOW_UP"
  }

  return "NONE"
}

const shouldUpdateOutcome = (
  current: StudioApplicationDetail,
  nextValue: {
    registrationStatus: ApplicationRegistrationStatus
    unregisteredReason: ApplicationUnregisteredReason | null
    unregisteredReasonNote: string | null
  }
) => {
  return (
    current.registrationStatus !== nextValue.registrationStatus ||
    current.unregisteredReason !== nextValue.unregisteredReason ||
    current.unregisteredReasonNote !== nextValue.unregisteredReasonNote
  )
}

export async function createConsultationLogAction(
  applicationId: string,
  previousState: CreateConsultationLogActionState = defaultState,
  formData: FormData
): Promise<CreateConsultationLogActionState> {
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
      message: "체험 완료 이후에만 상담 기록을 추가할 수 있습니다."
    }
  }

  if (current.registrationStatus === "enrolled" || current.registrationStatus === "not_enrolled") {
    return {
      status: "error",
      message: "종결된 신청에는 새 상담 기록을 추가할 수 없습니다."
    }
  }

  const submissionId = normalizeOptionalText(formData.get("submissionId"))
  if (!submissionId) {
    return {
      status: "error",
      message: "제출 정보를 확인하지 못했습니다. 다시 시도해 주세요."
    }
  }

  const channel = normalizeChannel(formData.get("channel"))
  if (!channel) {
    return {
      status: "error",
      message: "상담 방식을 선택해 주세요."
    }
  }

  const note = normalizeOptionalText(formData.get("note"))
  if (!note) {
    return {
      status: "error",
      message: "상담 내용을 입력해 주세요."
    }
  }

  const sentiment = normalizeSentiment(formData.get("sentiment"))
  if (!sentiment) {
    return {
      status: "error",
      message: "학부모 반응을 선택해 주세요."
    }
  }

  const registrationStatus = normalizeRegistrationStatus(formData.get("registrationStatus"))
  if (!registrationStatus) {
    return {
      status: "error",
      message: "등록 상태 값이 올바르지 않습니다."
    }
  }

  const unregisteredReason = normalizeUnregisteredReason(formData.get("unregisteredReason"))
  const unregisteredReasonNote = normalizeOptionalText(formData.get("unregisteredReasonNote"))

  if (formData.get("unregisteredReason") && !unregisteredReason) {
    return {
      status: "error",
      message: "미등록 사유 값이 올바르지 않습니다."
    }
  }

  if (registrationStatus === "not_enrolled" && !unregisteredReason) {
    return {
      status: "error",
      message: "미등록 사유를 선택해 주세요."
    }
  }

  if (
    registrationStatus === "not_enrolled" &&
    unregisteredReason === "other" &&
    !unregisteredReasonNote
  ) {
    return {
      status: "error",
      message: "기타 사유를 입력해 주세요."
    }
  }

  const nextContactInput = normalizeOptionalText(formData.get("nextContactAt"))
  const nextContactAt =
    registrationStatus === "enrolled" || registrationStatus === "not_enrolled"
      ? null
      : nextContactInput
        ? parseSeoulDateTimeLocalToIso(nextContactInput)
        : null

  if (nextContactInput && registrationStatus !== "enrolled" && registrationStatus !== "not_enrolled" && !nextContactAt) {
    return {
      status: "error",
      message: "다음 연락일 형식이 올바르지 않습니다."
    }
  }

  const occurredAt = new Date().toISOString()
  const resolvedUnregisteredReason =
    registrationStatus === "not_enrolled" ? unregisteredReason : null
  const resolvedUnregisteredReasonNote =
    registrationStatus === "not_enrolled" && unregisteredReason === "other"
      ? unregisteredReasonNote
      : null
  const nextAction = resolveConsultationNextAction(registrationStatus, nextContactAt)

  try {
    if (
      shouldUpdateOutcome(current, {
        registrationStatus,
        unregisteredReason: resolvedUnregisteredReason,
        unregisteredReasonNote: resolvedUnregisteredReasonNote
      })
    ) {
      await dataAdapter.updateStudioApplicationOutcome({
        applicationId,
        actorId: teacher.id,
        currentStatus: current.status,
        previousRegistrationStatus: current.registrationStatus,
        previousLostAt: current.lostAt,
        consultationNote: current.consultationNote,
        trialFeedback: current.trialFeedback,
        registeredCourse: current.registeredCourse,
        finalLevel: current.finalLevel,
        finalSchedule: current.finalSchedule,
        followUpNote: current.followUpNote,
        registrationStatus,
        unregisteredReason: resolvedUnregisteredReason,
        unregisteredReasonNote: resolvedUnregisteredReasonNote,
        note: "상담 기록에서 등록 전환을 저장했습니다."
      })
    }

    await dataAdapter.createStudioConsultationLog({
      id: submissionId,
      applicationId,
      actorId: teacher.id,
      occurredAt,
      activityType: "CONSULTATION",
      channel,
      sentiment,
      registrationStatusSnapshot: registrationStatus,
      nextAction,
      nextContactAt,
      note
    })

    await dataAdapter.updateStudioApplicationConsultationSnapshot({
      applicationId,
      currentStatus: current.status,
      nextContactAt,
      lastActivityAt: occurredAt
    })

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: "상담 기록을 저장했습니다.",
      successToken: crypto.randomUUID()
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_create_consultation_log"

    if (
      message === "application_outcome_status_conflict" ||
      message === "application_consultation_snapshot_conflict"
    ) {
      return {
        status: "error",
        message: "신청 상태가 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "상담 기록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
