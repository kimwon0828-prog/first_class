"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { parseSeoulDateTimeLocalToIso } from "@/features/studio/lib/seoul-datetime"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type { ConsultationLogChannel, ConsultationSentiment } from "@/shared/lib/db/adapter"

export type UpdateConsultationLogActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
}

const defaultState: UpdateConsultationLogActionState = {
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

export async function updateConsultationLogAction(
  applicationId: string,
  consultationLogId: string,
  previousState: UpdateConsultationLogActionState = defaultState,
  formData: FormData
): Promise<UpdateConsultationLogActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const { data: current, error } = await getStudioApplicationDetail(applicationId, teacher.organizationId)

  if (error || !current) {
    return {
      status: "error",
      message: "조회 가능한 신청이 아니거나 신청 정보를 불러오지 못했습니다."
    }
  }

  const targetLog = current.consultationLogs.find((item) => item.id === consultationLogId) ?? null
  if (!targetLog) {
    return {
      status: "error",
      message: "수정할 상담 기록을 찾지 못했습니다."
    }
  }

  if (targetLog.activityType !== "CONSULTATION") {
    return {
      status: "error",
      message: "이 상담 기록은 수정할 수 없습니다."
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
  const nextContactAt = nextContactInput ? parseSeoulDateTimeLocalToIso(nextContactInput) : null

  if (nextContactInput && !nextContactAt) {
    return {
      status: "error",
      message: "다음 연락일 형식이 올바르지 않습니다."
    }
  }

  const latestConsultationLog =
    current.consultationLogs.find((item) => item.activityType === "CONSULTATION") ?? null
  const shouldSyncLatestSnapshot = latestConsultationLog?.id === consultationLogId

  try {
    await dataAdapter.updateStudioConsultationLog({
      applicationId,
      consultationLogId,
      actorId: teacher.id,
      channel,
      sentiment,
      nextContactAt,
      note
    })

    if (shouldSyncLatestSnapshot) {
      await dataAdapter.updateStudioApplicationLatestConsultationSnapshot({
        applicationId,
        currentStatus: current.status,
        nextContactAt
      })
    }

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: "상담 기록이 수정되었습니다.",
      successToken: crypto.randomUUID()
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_update_consultation_log"

    if (
      message === "consultation_log_update_conflict" ||
      message === "application_consultation_snapshot_conflict"
    ) {
      return {
        status: "error",
        message: "상담 기록이 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "상담 기록 수정에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
