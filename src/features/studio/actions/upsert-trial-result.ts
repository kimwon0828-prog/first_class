"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  isLegacyTrialResultObservation,
  normalizeTrialResultObservation
} from "@/features/studio/lib/trial-result-options"
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

/**
 * 폼이 보낸 관찰 값을 code 목록으로 바꾼다.
 *
 * ⚠️ 화면이 7개만 보여 준다는 사실에 기대지 않는다. 이 action 은 server action 이라
 *    조작된 요청이 직접 닿을 수 있고, 여기를 통과한 값이 그대로 DB 에 들어간다.
 *
 * canonical code 만 받는다. 문구를 저장하던 시절의 값은 여기서 거절한다 —
 * 의미가 같지 않아 code 로 바꿔 줄 수 없고, 그대로 통과시키면 신규 저장이
 * legacy 값을 계속 새로 만들어 낸다. 기존 legacy 는 payload 가 아니라
 * 아래 저장 경로에서 기존 row 를 그대로 다시 쓰는 방식으로 보존한다.
 *
 * 받을 수 없는 값은 조용히 버리지 않고 실패로 돌려준다. 일부만 저장하면 입력 오류가
 * 숨겨져, 원장은 저장됐다고 믿는데 실제로는 빠진 항목이 생긴다.
 */
type ObservationPayload =
  | { status: "ok"; values: string[] }
  | { status: "legacy" }
  | { status: "unknown" }

const normalizeObservationValues = (values: FormDataEntryValue[]): ObservationPayload => {
  const normalized: string[] = []

  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      continue
    }

    const code = normalizeTrialResultObservation(value)
    if (!code) {
      // 구버전 화면이 보낸 문구인지, 아예 모르는 값인지 구분한다.
      // 원장에게 보여 줄 안내가 달라진다.
      return { status: isLegacyTrialResultObservation(value) ? "legacy" : "unknown" }
    }

    normalized.push(code)
  }

  return { status: "ok", values: Array.from(new Set(normalized)) }
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

  const submitted = normalizeObservationValues(formData.getAll("observations"))
  if (submitted.status === "legacy") {
    return {
      status: "error",
      message:
        "이전 버전 화면에서 보낸 관찰 항목입니다. 화면을 새로고침한 뒤 현재 기준의 항목으로 다시 선택해 주세요."
    }
  }

  if (submitted.status === "unknown") {
    return {
      status: "error",
      message: "유효하지 않은 관찰 항목입니다. 화면을 새로고침한 뒤 다시 선택해 주세요."
    }
  }

  // 관찰 항목을 건드리지 않은 저장은 기존 값을 그대로 다시 쓴다.
  //
  // 문구를 저장하던 시절의 값이 들어 있는 row 는 폼의 canonical 토글로 표현할 수
  // 없다. 추천 과정만 고치는 저장에서 폼이 보낸 빈 목록으로 덮으면, 원장이 건드린
  // 적도 없는 과거 관찰 기록이 조용히 사라진다.
  //
  // 반대로 원장이 관찰 항목을 실제로 선택했다면 그 선택이 기준이다. 이때 legacy
  // 값은 대체된다 — 폼이 그렇게 안내한다.
  const observationsTouched = formData.get("observationsTouched") === "true"
  const preservedObservations = current.trialResult?.observations ?? []
  const observations = observationsTouched ? submitted.values : preservedObservations

  const nextValue = {
    observations,
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
