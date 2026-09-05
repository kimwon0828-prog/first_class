"use server"

import { revalidatePath } from "next/cache"

import type { ReservationImportPreviewRow } from "@/features/reservation-import/lib/reservation-import-preview"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// 선택된 행 전체를 하나의 transaction 으로 저장한다.
//
// 한 행이라도 실패하면 전부 되돌린다 — 신청 · 예약 블록 · 활동 기록 · 가져오기 이력 모두.
// 같은 batch 를 다시 제출하면 아무것도 쓰지 않고 첫 결과를 돌려준다(재클릭 대비).
//
// SMS 는 이 경로에 없다. 과거 예약을 옮겼다고 학부모에게 안내가 나가면 안 된다.

export type CommitReservationImportState = {
  status: "idle" | "error" | "success"
  message: string
  importedRows?: number
  mode?: "created" | "duplicate"
}

const defaultState: CommitReservationImportState = {
  status: "idle",
  message: ""
}

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "다시 로그인한 뒤 시도해 주세요.",
  import_batch_not_found_or_forbidden: "가져오기 정보를 찾지 못했습니다. 파일을 다시 올려 주세요.",
  import_batch_in_progress: "가져오기가 진행 중입니다. 잠시 후 다시 확인해 주세요.",
  import_rows_empty: "가져올 예약을 선택해 주세요.",
  import_status_not_allowed: "가져올 수 없는 진행 상태가 있습니다.",
  import_class_not_in_organization: "우리 학원 수업이 아닌 행이 있습니다.",
  import_teacher_not_in_organization: "우리 학원 선생님이 아닌 행이 있습니다.",
  import_teacher_inactive: "비활성 선생님이 지정된 행이 있습니다."
}

export async function commitReservationImportAction(
  batchId: string,
  rows: ReservationImportPreviewRow[],
  previousState: CommitReservationImportState = defaultState
): Promise<CommitReservationImportState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  void teacher

  const payload = rows
    .filter((row) => row.selected && row.write)
    .map((row) => ({
      rowNumber: row.rowNumber,
      fingerprint: row.fingerprint,
      classId: row.write!.classId,
      childName: row.write!.childName,
      childGrade: row.write!.childGrade,
      childSchool: row.write!.childSchool,
      parentName: row.write!.parentName,
      parentPhone: row.write!.parentPhone,
      memo: row.write!.memo,
      status: row.write!.status,
      requestedSlotAt: row.write!.requestedSlotAt,
      teacherId: row.write!.confirmedRange?.teacherId ?? null,
      confirmedStartAt: row.write!.confirmedRange?.startAt ?? null,
      confirmedEndAt: row.write!.confirmedRange?.endAt ?? null
    }))

  if (payload.length === 0) {
    return { status: "error", message: "가져올 예약을 선택해 주세요." }
  }

  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: payload
    })

    if (error) {
      const domainError = Object.keys(ERROR_MESSAGES).find((code) =>
        error.message.includes(code)
      )
      return {
        status: "error",
        message: domainError
          ? ERROR_MESSAGES[domainError]!
          : "예약을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    const result = data as { mode: "created" | "duplicate"; importedRows: number } | null
    if (!result) {
      return {
        status: "error",
        message: "예약을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    try {
      revalidatePath("/studio")
      revalidatePath("/studio/cases")
    } catch (revalidateError) {
      console.warn("non_critical_failed_to_revalidate_after_import", revalidateError)
    }

    return {
      status: "success",
      mode: result.mode,
      importedRows: result.importedRows,
      message:
        result.mode === "duplicate"
          ? `이미 가져온 파일입니다. ${result.importedRows}건이 저장되어 있습니다.`
          : `${result.importedRows}건의 예약을 가져왔습니다.`
    }
  } catch {
    return {
      status: "error",
      message: "예약을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
