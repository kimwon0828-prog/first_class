"use server"

import { revalidatePath } from "next/cache"

import { readRegularSchedulePreferenceInput } from "@/features/studio/lib/regular-schedule-preference-input"
import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { parseSeoulDateTimeLocalToIso } from "@/features/studio/lib/seoul-datetime"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type {
  ConsultationLogChannel,
  ConsultationSentiment
} from "@/shared/lib/db/adapter"

export type CreateConsultationLogActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
  /**
   * 성공의 종류. duplicate 는 "같은 제출이 이미 저장돼 있다"는 뜻이며
   * 이번 입력값은 저장되지 않았다. 화면이 이를 구분해 알려야 한다.
   */
  successMode?: "created" | "duplicate"
}

const defaultState: CreateConsultationLogActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const CHANNEL_VALUES = new Set<ConsultationLogChannel>(["PHONE", "KAKAO", "SMS", "VISIT", "OTHER"])
const SENTIMENT_VALUES = new Set<ConsultationSentiment>(["POSITIVE", "NEUTRAL", "NEGATIVE"])

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
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

export async function createConsultationLogAction(
  applicationId: string,
  previousState: CreateConsultationLogActionState = defaultState,
  formData: FormData
): Promise<CreateConsultationLogActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  // 지금은 모든 요금제에서 열려 있다(기록은 무료다). gate 를 지우지 않는 이유는
  // 이것이 요금제가 쓰기에 닿는 단 하나의 지점이기 때문이다 — 나중에 이 기록에
  // 요금제 조건이 생기면 여기만 보면 된다. 조회 실패는 허용하지 않는다(fail closed).
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteConsultations")
  if (!entitlement.allowed) {
    return {
      status: "error",
      message: entitlement.message
    }
  }

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

  // Registration state never gates optional contact records. DB checks lifecycle and ownership.

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

  const nextContactInput = normalizeOptionalText(formData.get("nextContactAt"))
  const nextContactAt = nextContactInput ? parseSeoulDateTimeLocalToIso(nextContactInput) : current.nextContactAt
  if (nextContactInput && !nextContactAt) return { status: "error", message: "다음 연락일 형식이 올바르지 않습니다." }
  const timeFlexibility = normalizeOptionalText(formData.get("timeFlexibility"))
  if (timeFlexibility && !["exact", "plus_minus_30", "same_day_flexible", "flexible"].includes(timeFlexibility))
    return { status: "error", message: "시간 유연성을 확인해 주세요." }
  // 희망 일정은 선택 입력이다. 건드리지 않은 값은 미전달로 보존한다.
  // "미전달"과 "undecided"를 절대 같게 처리하지 않는다.
  const preferenceInput = readRegularSchedulePreferenceInput(formData)
  if (preferenceInput.status === "invalid") {
    return {
      status: "error",
      message: "정규수업 희망 일정 값이 올바르지 않습니다."
    }
  }

  const occurredInput = normalizeOptionalText(formData.get("occurredAt"))
  const occurredAt = occurredInput ? parseSeoulDateTimeLocalToIso(occurredInput) : new Date().toISOString()
  if (!occurredAt) return { status: "error", message: "상담 일시를 확인해 주세요." }
  try {
    // 상담 로그와 희망 일정/다음 연락 스냅샷만 하나의 transaction으로 저장한다.
    // 조직 스코프, 상태 guard, 멱등 판정은 전부 잠근 row 기준으로 여기 안에서 다시 확인된다.
    // 위에서 읽은 current 는 form 문맥과 희망 일정 비교용이지 transaction 의 근거가 아니다.
    const result = await dataAdapter.createStudioConsultationTransaction({
      submissionId,
      applicationId,
      occurredAt,
      channel,
      sentiment,
      note,
      nextAction: nextContactAt ? "FOLLOW_UP" : "NONE",
      timeFlexibility,
      nextContactAt,
      // 미전달이면 Case 의 희망 일정을 건드리지 않는다. undecided 와 같게 처리하지 않는다.
      preferenceProvided: preferenceInput.status === "present",
      preference: preferenceInput.status === "present" ? preferenceInput.preference : null,
      preferenceNote: preferenceInput.status === "present" ? preferenceInput.note : null
    })

    // 저장은 이미 commit 됐다. 화면 갱신이 실패해도 "저장 실패"로 보고하지 않는다.
    try {
      revalidatePath("/studio")
      revalidatePath("/studio/cases")
      revalidatePath("/studio/applications")
      revalidatePath(`/studio/applications/${applicationId}`)
    } catch (revalidateError) {
      console.warn("non_critical_failed_to_revalidate_consultation_paths", revalidateError)
    }

    return {
      status: "success",
      // duplicate 는 "이번 입력을 저장했다"가 아니라 "같은 제출이 이미 저장돼 있다"는 뜻이다.
      // 재시도 전에 내용을 고쳤더라도 그 수정본은 저장되지 않으므로 그렇게 말하지 않는다.
      message:
        result.mode === "duplicate"
          ? "이미 저장된 상담 기록입니다. 내용을 바꾸려면 상담 이력에서 수정해 주세요."
          : "상담 기록을 저장했습니다.",
      successToken: crypto.randomUUID(),
      successMode: result.mode
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_create_consultation_log"

    if (message === "application_not_found_or_forbidden") {
      return {
        status: "error",
        message: "조회 가능한 신청이 아니거나 신청 정보를 불러오지 못했습니다."
      }
    }

    if (message === "application_not_completed") {
      return {
        status: "error",
        message: "체험 완료 이후에만 상담 기록을 추가할 수 있습니다."
      }
    }

    if (message === "consultation_submission_conflict") {
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
