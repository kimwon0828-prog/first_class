"use server"

import { revalidatePath } from "next/cache"

import { isParentDecision } from "@/features/decisions/lib/parent-decision"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { dataAdapter } from "@/shared/lib/db"

export type SetParentDecisionActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
}

const defaultState: SetParentDecisionActionState = {
  status: "idle",
  message: "",
  successToken: null
}

/**
 * DB 가 돌려준 이유를 학부모가 읽을 수 있는 말로.
 *
 * Postgres 원문을 그대로 올리지 않는다. 학부모에게 함수 이름과 제약 조건 이름을
 * 보여 줄 이유가 없다.
 */
const resolveErrorMessage = (caught: unknown) => {
  const raw = caught instanceof Error ? caught.message : ""

  if (raw.includes("application_not_completed")) {
    return "체험을 마친 뒤에 선택할 수 있어요."
  }

  if (raw.includes("invalid_parent_decision")) {
    return "선택한 값을 확인하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
  }

  return "선택을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
}

export async function setParentDecisionAction(
  experienceId: string,
  previousState: SetParentDecisionActionState = defaultState,
  formData: FormData
): Promise<SetParentDecisionActionState> {
  void previousState

  await requireParentAccess({ returnTo: `/record/${experienceId}` })

  const decision = formData.get("decision")
  if (!isParentDecision(decision)) {
    return {
      status: "error",
      message: "선택한 값을 확인하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
    }
  }

  try {
    // 소유 확인은 DB 함수가 한다 — parent_id 를 넘기지 않고 auth.uid() 로 잠근다.
    // 남의 신청 id 를 넣어도 존재 여부가 드러나지 않는다.
    await dataAdapter.setParentDecision(experienceId, decision)

    revalidatePath(`/record/${experienceId}`)
    revalidatePath("/record")

    return {
      status: "success",
      message: "선택을 저장했어요.",
      successToken: crypto.randomUUID()
    }
  } catch (caught) {
    return { status: "error", message: resolveErrorMessage(caught) }
  }
}
