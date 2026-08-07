"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export async function updateStudioClassScheduleCapacityAction(input: {
  classScheduleId: string
  capacity: number
}) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId: input.classScheduleId,
    capacity: input.capacity
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}

export async function closeStudioClassScheduleAction(classScheduleId: string) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId,
    bookingStatus: "closed"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}

export async function reopenStudioClassScheduleAction(classScheduleId: string) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId,
    bookingStatus: "open"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}

export async function hideStudioClassScheduleAction(classScheduleId: string) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId,
    bookingStatus: "hidden"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}

export async function publishStudioClassScheduleAction(classScheduleId: string) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedule({
    organizationId: teacher.organizationId,
    classScheduleId,
    bookingStatus: "open"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
}

export async function closeStudioClassSchedulesForDateAction(input: {
  classId: string
  specificDate: string
}) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedulesForDate({
    organizationId: teacher.organizationId,
    classId: input.classId,
    specificDate: input.specificDate,
    bookingStatus: "closed"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
  revalidatePath(`/classes/${input.classId}`)
}

export async function reopenStudioClassSchedulesForDateAction(input: {
  classId: string
  specificDate: string
}) {
  const teacher = await requireTeacherStudioAccess()

  await dataAdapter.updateStudioClassSchedulesForDate({
    organizationId: teacher.organizationId,
    classId: input.classId,
    specificDate: input.specificDate,
    bookingStatus: "open"
  })

  revalidatePath("/studio")
  revalidatePath("/studio/schedule")
  revalidatePath("/classes")
  revalidatePath(`/classes/${input.classId}`)
}
