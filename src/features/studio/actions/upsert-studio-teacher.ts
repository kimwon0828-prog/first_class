"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type UpsertStudioTeacherActionState = {
  ok: boolean
  message: string
}

const defaultState: UpsertStudioTeacherActionState = {
  ok: false,
  message: ""
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizeMode = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim()
  return raw === "create" || raw === "update" ? raw : null
}

const normalizeTeacherId = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim()
  return uuidPattern.test(raw) ? raw : null
}

const normalizeOptionalPhone = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim()
  if (!raw) {
    return null
  }

  return raw
}

export async function upsertStudioTeacherAction(
  previousState: UpsertStudioTeacherActionState = defaultState,
  formData: FormData
): Promise<UpsertStudioTeacherActionState> {
  void previousState

  try {
    const teacher = await requireTeacherStudioAccess()
    const mode = normalizeMode(formData.get("mode"))
    const teacherId = normalizeTeacherId(formData.get("teacherId"))
    const displayName = String(formData.get("displayName") ?? "").trim()
    const phone = normalizeOptionalPhone(formData.get("phone"))
    const smsEnabled = formData.get("smsEnabled") === "on"

    if (!mode) {
      return { ok: false, message: "요청 모드를 확인할 수 없습니다." }
    }

    if (mode === "update" && !teacherId) {
      return { ok: false, message: "수정할 선생님 정보를 다시 선택해 주세요." }
    }

    if (displayName.length < 2 || displayName.length > 30) {
      return { ok: false, message: "선생님 이름은 2자 이상 30자 이하로 입력해 주세요." }
    }

    if (phone && !/^[0-9-+\s()]{9,20}$/.test(phone)) {
      return { ok: false, message: "전화번호 형식이 올바르지 않습니다. 예: 010-1234-5678" }
    }

    if (mode === "create") {
      await dataAdapter.createStudioTeacher({
        organizationId: teacher.organizationId,
        displayName,
        phone,
        smsEnabled
      })
    } else {
      await dataAdapter.updateStudioTeacher({
        teacherId: teacherId as string,
        organizationId: teacher.organizationId,
        displayName,
        phone,
        smsEnabled
      })
    }

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/studio/teachers")
    revalidatePath("/classes")

    return {
      ok: true,
      message: mode === "create" ? "선생님을 등록했습니다." : "선생님 정보를 수정했습니다."
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"

    if (message.includes("teacher_seat_limit_reached")) {
      return {
        ok: false,
        message: "등록 가능한 active 선생님 수를 초과했습니다. 추가 선생님 등록은 추가 결제 상품으로 제공될 예정입니다."
      }
    }

    if (message.includes("teacher_not_found_or_forbidden")) {
      return { ok: false, message: "같은 학원에 등록된 선생님만 수정할 수 있습니다." }
    }

    return { ok: false, message: "선생님 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." }
  }
}
