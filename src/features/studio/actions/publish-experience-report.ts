"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioTrialResultSaveContext } from "@/features/studio/queries/get-studio-trial-result-save-context"
import { dataAdapter } from "@/shared/lib/db"

export type PublishExperienceReportActionState = {
  status: "idle" | "error" | "success"
  message: string
  version?: number
  successToken?: string | null
}

const defaultState: PublishExperienceReportActionState = {
  status: "idle",
  message: "",
  successToken: null
}

/**
 * DB 가 돌려준 이유를 원장이 읽을 수 있는 말로.
 *
 * 전부 "오류가 발생했습니다" 로 뭉개지 않는다. 발행이 막히는 이유는 대부분
 * 사용자가 고칠 수 있는 것이고, 무엇을 고쳐야 하는지 말해 주지 않으면
 * 같은 버튼을 다시 누르는 것 말고 할 수 있는 일이 없다.
 */
const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  parent_not_linked: "학부모 계정이 연결되어 있지 않습니다. 연결 후 리포트를 발행할 수 있어요.",
  legacy_observations_require_review:
    "기존 기준으로 작성된 관찰 기록입니다. 현재 기준의 관찰 항목을 다시 확인한 뒤 발행해 주세요.",
  assessment_changed_since_preview:
    "체험평가 내용이 변경되었습니다. 최신 내용을 다시 확인한 후 발행해 주세요.",
  experience_date_missing: "체험 날짜를 확인할 수 없어 리포트를 발행할 수 없습니다.",
  report_content_missing:
    "부모님께 전달할 리포트 내용이 아직 없습니다. 관찰 내용이나 추천 정보를 확인한 뒤 발행해 주세요.",
  application_not_completed: "체험 완료 후에 리포트를 발행할 수 있습니다.",
  trial_result_not_found: "체험 결과를 먼저 기록해 주세요.",
  unknown_observations_cannot_publish:
    "알 수 없는 관찰 항목이 있습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.",
  application_not_found_or_forbidden: "조회 가능한 신청이 아닙니다."
}

/** Postgres 가 붙이는 접두어를 걷어내고 우리가 던진 이름만 남긴다. */
const resolveErrorMessage = (caught: unknown) => {
  const raw = caught instanceof Error ? caught.message : ""

  for (const [code, message] of Object.entries(PUBLISH_ERROR_MESSAGES)) {
    if (raw.includes(code)) {
      return message
    }
  }

  return "리포트 발행에 실패했습니다. 잠시 후 다시 시도해 주세요."
}

export async function publishExperienceReportAction(
  applicationId: string,
  previousState: PublishExperienceReportActionState = defaultState,
  formData: FormData
): Promise<PublishExperienceReportActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  // DB 함수도 권한을 확인하지만 여기서 생략하지 않는다.
  // server action 은 form 없이 직접 호출될 수 있고, 요금제는 DB 가 모른다.
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteTrialResults")
  if (!entitlement.allowed) {
    return { status: "error", message: entitlement.message }
  }

  // 조직 scope 를 action 에서도 좁힌다. 다른 조직 신청 id 는 여기서 끝난다.
  const { data: context, error } = await getStudioTrialResultSaveContext(
    applicationId,
    teacher.organizationId
  )

  if (error || !context) {
    return {
      status: "error",
      message: "조회 가능한 신청이 아니거나 신청 정보를 불러오지 못했습니다."
    }
  }

  const expectedAssessmentUpdatedAt = formData.get("expectedAssessmentUpdatedAt")
  if (typeof expectedAssessmentUpdatedAt !== "string" || !expectedAssessmentUpdatedAt.trim()) {
    return {
      status: "error",
      message: "확인한 체험평가 정보를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
    }
  }

  try {
    // 원장이 미리보기에서 본 revision 을 그대로 넘긴다.
    // 그 사이 평가가 바뀌었으면 DB 가 거절한다 — 자동으로 다시 시도하지 않는다.
    const result = await dataAdapter.publishExperienceReport(
      applicationId,
      expectedAssessmentUpdatedAt
    )

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message:
        result.supersededVersion === null
          ? "리포트를 발행했어요."
          : "새 버전의 리포트를 발행했어요.",
      version: result.version,
      successToken: crypto.randomUUID()
    }
  } catch (caught) {
    return { status: "error", message: resolveErrorMessage(caught) }
  }
}
