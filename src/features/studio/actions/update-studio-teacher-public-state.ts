"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import {
  DEFAULT_TEACHER_PUBLIC_VISIBILITY,
  TEACHER_PUBLIC_VISIBILITY_KEYS,
  type TeacherPublicVisibility
} from "@/shared/lib/teacher-public-visibility"

export type UpdateStudioTeacherPublicStateActionResult = {
  ok: boolean
  message: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const buildVisibility = (isPublic: boolean): TeacherPublicVisibility => {
  if (isPublic) {
    return { ...DEFAULT_TEACHER_PUBLIC_VISIBILITY }
  }

  return TEACHER_PUBLIC_VISIBILITY_KEYS.reduce(
    (acc, key) => {
      acc[key] = false
      return acc
    },
    {} as TeacherPublicVisibility
  )
}

export async function updateStudioTeacherPublicStateAction(
  teacherId: string,
  isPublic: boolean
): Promise<UpdateStudioTeacherPublicStateActionResult> {
  try {
    const actor = await requireTeacherStudioAccess()
    const normalizedTeacherId = teacherId.trim()

    if (!uuidPattern.test(normalizedTeacherId)) {
      return { ok: false, message: "공개 상태를 변경할 선생님 정보를 확인할 수 없습니다." }
    }

    const teachers = await dataAdapter.listStudioTeachers(actor.organizationId)
    const target = teachers.find((item) => item.id === normalizedTeacherId)

    if (!target) {
      return { ok: false, message: "같은 학원에 등록된 선생님만 공개 상태를 변경할 수 있습니다." }
    }

    await dataAdapter.updateStudioTeacher({
      teacherId: target.id,
      organizationId: actor.organizationId,
      displayName: target.displayName,
      phone: target.phone,
      smsEnabled: target.smsEnabled,
      intro: target.intro,
      subjects: target.subjects,
      targetStudents: target.targetStudents,
      specialties: target.specialties,
      shortIntro: target.shortIntro,
      teachingStyle: target.teachingStyle,
      publicVisibility: buildVisibility(isPublic)
    })

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/studio/teachers")
    revalidatePath("/classes")

    return {
      ok: true,
      message: isPublic
        ? "학부모 페이지 공개를 켰습니다."
        : "학부모 페이지 공개를 껐습니다."
    }
  } catch {
    return { ok: false, message: "공개 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." }
  }
}
