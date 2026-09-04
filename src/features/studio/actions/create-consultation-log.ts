"use server"

import { revalidatePath } from "next/cache"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import {
  readRegularSchedulePreferenceInput,
  resolveRegularSchedulePreferenceWrite
} from "@/features/studio/lib/regular-schedule-preference-input"
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

  // 희망 일정은 선택 입력이다. 지금 UI 에는 필드가 없으므로 대부분 "미전달"로 들어온다.
  // "미전달"과 "undecided"를 절대 같게 처리하지 않는다.
  const preferenceInput = readRegularSchedulePreferenceInput(formData)
  if (preferenceInput.status === "invalid") {
    return {
      status: "error",
      message: "정규수업 희망 일정 값이 올바르지 않습니다."
    }
  }

  const occurredAt = new Date().toISOString()
  const preferenceWrite = resolveRegularSchedulePreferenceWrite({
    input: preferenceInput,
    current,
    now: occurredAt
  })
  const resolvedUnregisteredReason =
    registrationStatus === "not_enrolled" ? unregisteredReason : null
  const resolvedUnregisteredReasonNote =
    registrationStatus === "not_enrolled" && unregisteredReason === "other"
      ? unregisteredReasonNote
      : null
  const nextAction = resolveConsultationNextAction(registrationStatus, nextContactAt)
  // 등록 전환 알림은 "실제로 non-enrolled → enrolled 로 바뀐 상담"에서만 나간다.
  // 위 가드에서 종결(enrolled / not_enrolled) Case 를 이미 돌려보내므로 여기의
  // current.registrationStatus 는 반드시 undecided | pending 이다.
  // 따라서 enrolled 로 저장하는 순간이 곧 전환 시점이고,
  // enrolled → enrolled 재저장이나 메모/희망 일정/다음 연락만 바꾼 저장은 여기에 걸리지 않는다.
  const isEnrollmentTransition = registrationStatus === "enrolled"
  let outcomeUpdated = false

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
      outcomeUpdated = true
    }

    const logMode = await dataAdapter.createStudioConsultationLog({
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
      note,
      // 스냅샷은 "이번에 입력한 값"이 아니라 "이 상담 시점의 Case 상태"다.
      // 미전달이면 기존 current 값이 그대로 찍힌다(registrationStatusSnapshot 과 같은 의미).
      regularSchedulePreferenceSnapshot: preferenceWrite.snapshot,
      regularSchedulePreferenceNoteSnapshot: preferenceWrite.snapshotNote,
      // 미등록 사유는 Case 의 현재 값과 달리 이후 재개로 지워지지 않는다.
      // Case 컬럼에 쓰는 값과 같은 변수를 쓴다 — 두 곳이 어긋나면 이력이 거짓이 된다.
      unregisteredReasonSnapshot: resolvedUnregisteredReason,
      unregisteredReasonNoteSnapshot: resolvedUnregisteredReasonNote
    })

    await dataAdapter.updateStudioApplicationConsultationSnapshot({
      applicationId,
      currentStatus: current.status,
      nextContactAt,
      lastActivityAt: occurredAt,
      // 미전달이면 undefined 라 Case 의 희망 일정 컬럼을 건드리지 않는다.
      regularSchedulePreferenceWrite: preferenceWrite.caseWrite
    })

    // 저장이 모두 끝난 뒤에 보낸다. 같은 submissionId 로 재제출된 요청(duplicate)은
    // 이미 첫 제출에서 발송했으므로 다시 보내지 않는다.
    // logSmsEventSafely 는 실패해도 throw 하지 않아 저장을 되돌리지 않는다.
    if (isEnrollmentTransition && outcomeUpdated && logMode === "created") {
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
