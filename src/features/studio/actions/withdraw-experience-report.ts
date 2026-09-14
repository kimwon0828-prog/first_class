"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioTrialResultSaveContext } from "@/features/studio/queries/get-studio-trial-result-save-context"
import { dataAdapter } from "@/shared/lib/db"

export type WithdrawExperienceReportActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
}

const defaultState: WithdrawExperienceReportActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const resolveErrorMessage = (caught: unknown) => {
  const raw = caught instanceof Error ? caught.message : ""

  if (raw.includes("published_report_not_found")) {
    return "현재 공개 중인 리포트가 없습니다."
  }

  if (raw.includes("application_not_found_or_forbidden")) {
    return "조회 가능한 신청이 아닙니다."
  }

  return "리포트 발행 철회에 실패했습니다. 잠시 후 다시 시도해 주세요."
}

export async function withdrawExperienceReportAction(
  applicationId: string,
  previousState: WithdrawExperienceReportActionState = defaultState,
  formData: FormData
): Promise<WithdrawExperienceReportActionState> {
  void previousState
  void formData

  const teacher = await requireTeacherStudioAccess()

  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteTrialResults")
  if (!entitlement.allowed) {
    return { status: "error", message: entitlement.message }
  }

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

  try {
    // 철회는 삭제가 아니다. 발행 기록은 DB 에 남고 부모만 읽지 못하게 된다.
    await dataAdapter.withdrawExperienceReport(applicationId)

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: "리포트 발행을 철회했어요.",
      successToken: crypto.randomUUID()
    }
  } catch (caught) {
    return { status: "error", message: resolveErrorMessage(caught) }
  }
}
