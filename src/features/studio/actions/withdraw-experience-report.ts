"use server"

import { revalidatePath } from "next/cache"

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

  // ⚠️ 요금제 gate 를 두지 않는다. 의도적이다.
  //
  //    철회는 이미 학부모에게 나간 문서를 거두는 일이다. 발행을 막는 것과는 다르다.
  //    downgrade 로 Free 가 된 학원에서 철회까지 막으면, 잘못 나간 리포트를
  //    되돌릴 방법이 사라지고 학부모는 틀린 문서를 계속 보게 된다.
  //
  //    always-true entitlement 를 새로 만들어 형식만 맞추지도 않는다 —
  //    아무도 막지 않는 flag 는 계약이 아니라 장식이다.
  //
  //    권한은 여기서 두 겹으로 지킨다: Studio 인증(위)과 조직 scope(아래).
  //    RPC 도 자기 조직 신청만 철회한다.
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
