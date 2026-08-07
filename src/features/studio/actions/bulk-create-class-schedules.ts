"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type {
  BulkCreateClassSchedulesInput,
  BulkCreateClassSchedulesPreview
} from "@/shared/lib/db/adapter"

export async function previewBulkCreateClassSchedulesAction(
  input: Omit<BulkCreateClassSchedulesInput, "organizationId">
): Promise<BulkCreateClassSchedulesPreview> {
  const teacher = await requireTeacherStudioAccess()

  return dataAdapter.previewBulkCreateClassSchedules({
    ...input,
    organizationId: teacher.organizationId
  })
}

export async function bulkCreateClassSchedulesAction(
  input: Omit<BulkCreateClassSchedulesInput, "organizationId">
) {
  const teacher = await requireTeacherStudioAccess()

  const result = await dataAdapter.bulkCreateClassSchedules({
    ...input,
    organizationId: teacher.organizationId
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
  revalidatePath(`/classes/${input.classId}`)
  revalidatePath(`/classes/${input.classId}/apply`)

  return result
}
