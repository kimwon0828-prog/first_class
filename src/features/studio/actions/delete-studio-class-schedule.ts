"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export async function deleteStudioClassScheduleAction(classScheduleId: string) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.deleteStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}
