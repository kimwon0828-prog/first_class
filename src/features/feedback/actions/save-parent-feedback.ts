"use server"
import { revalidatePath } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { dataAdapter } from "@/shared/lib/db"
import { submitParentExperienceWorkflow, type FeedbackActionState } from "../lib/submit-parent-experience"
export type { FeedbackActionState } from "../lib/submit-parent-experience"
export async function submitParentExperienceAction(applicationId: string, _previous: FeedbackActionState, form: FormData): Promise<FeedbackActionState> {
  const parent = await requireParentAccess({ returnTo: `/record/${applicationId}/report` })
  return submitParentExperienceWorkflow(applicationId, parent.id, form, dataAdapter, revalidatePath)
}
