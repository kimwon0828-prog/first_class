"use server"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
export type SetParentDecisionActionState = { status: "idle" | "error" | "success"; message: string; successToken?: string | null }
/** Retired action: stale clients cannot bypass the final submission command. */
export async function setParentDecisionAction(experienceId: string): Promise<SetParentDecisionActionState> {
  await requireParentAccess({ returnTo: `/record/${experienceId}` })
  return { status: "error", message: "새로고침한 뒤 피드백과 현재 생각을 함께 보내 주세요." }
}
