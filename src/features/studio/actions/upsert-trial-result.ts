"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioTrialResultSaveContext } from "@/features/studio/queries/get-studio-trial-result-save-context"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioTrialResultSaveContext } from "@/shared/lib/db/adapter"

// 이 action 은 체험 결과(trial_results)만 저장한다.
// 등록 상태 / 미등록 사유 / enrolled_at / lost_at 는 등록 상담 경로에서만 바뀐다.
// 여기서 같은 값을 다시 써 넣으면 enrolled_at 이 저장할 때마다 갱신되어 버린다.

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

const areObservationListsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return sortedLeft.every((item, index) => item === sortedRight[index])
}

const getChangedFieldLabels = (
  current: StudioTrialResultSaveContext,
  nextValue: {
    observations: string[]
    recommendedCourse: string | null
    recommendedLevel: string | null
    recommendedSchedule: string | null
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

  // 유료 기능이다. form 없이 action 이 직접 호출될 수 있으므로 서버에서 막는다.
  // 조회 실패는 허용하지 않는다(fail closed).
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteTrialResults")
  if (!entitlement.allowed) {
    return {
      status: "error",
      message: entitlement.message
    }
  }

  const { data: current, error } = await getStudioTrialResultSaveContext(
    applicationId,
    teacher.organizationId
  )

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
    note: normalizeOptionalText(formData.get("note")),
    parentReaction: current.trialResult?.parentReaction ?? null,
    nextAction: current.trialResult?.nextAction ?? null
  }

  const changedFieldLabels = getChangedFieldLabels(current, nextValue)

  try {
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

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
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
