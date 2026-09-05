"use server"

import { parseReservationWorkbook } from "@/features/reservation-import/lib/parse-reservation-workbook"
import {
  RESERVATION_IMPORT_ERROR_MESSAGES,
  RESERVATION_IMPORT_MAX_FILE_BYTES
} from "@/features/reservation-import/lib/reservation-import-contract"
import {
  buildReservationImportPreviewRow,
  summarizeReservationImportRows,
  type ReservationImportPreview
} from "@/features/reservation-import/lib/reservation-import-preview"
import { buildReservationImportContext } from "@/features/reservation-import/queries/get-reservation-import-context"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// 업로드 → 파싱 → 검증까지만 한다. 이 단계에서는 신청을 만들지 않는다.
//
// 원본 파일은 저장하지 않는다. 메모리에서 읽고 버린다.

export type PreviewReservationImportState = {
  status: "idle" | "error" | "success"
  message: string
  preview?: ReservationImportPreview | null
}

const defaultState: PreviewReservationImportState = {
  status: "idle",
  message: "",
  preview: null
}

const PARSE_ERROR_MESSAGES: Record<string, string> = {
  not_xlsx_file: "엑셀(.xlsx) 파일만 올릴 수 있습니다.",
  workbook_unreadable: "파일을 읽지 못했습니다. 첫수업 양식으로 다시 저장한 뒤 올려 주세요.",
  input_sheet_missing: "`예약 데이터 입력` 시트를 찾지 못했습니다.",
  header_mismatch: "양식의 열 이름이 바뀌었습니다. 새 양식을 내려받아 다시 작성해 주세요.",
  no_rows: "가져올 예약이 없습니다.",
  row_limit_exceeded: RESERVATION_IMPORT_ERROR_MESSAGES.row_limit_exceeded!
}

export async function previewReservationImportAction(
  previousState: PreviewReservationImportState = defaultState,
  formData: FormData
): Promise<PreviewReservationImportState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const file = formData.get("file")

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "파일을 선택해 주세요." }
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { status: "error", message: PARSE_ERROR_MESSAGES.not_xlsx_file! }
  }

  if (file.size > RESERVATION_IMPORT_MAX_FILE_BYTES) {
    return { status: "error", message: "파일이 너무 큽니다. 5MB 이하로 올려 주세요." }
  }

  try {
    const parsed = await parseReservationWorkbook(await file.arrayBuffer())
    if (parsed.status === "error") {
      return {
        status: "error",
        message: PARSE_ERROR_MESSAGES[parsed.code] ?? "파일을 읽지 못했습니다."
      }
    }

    const context = await buildReservationImportContext(teacher.organizationId)
    const rows = parsed.rows.map((row) => buildReservationImportPreviewRow(row, context))
    const summary = summarizeReservationImportRows(rows)

    // batch 는 여기서 만든다. 이 id 가 이후 가져오기의 멱등 키가 된다.
    const supabase = await getSupabaseServerClient()
    const { data: batchId, error } = await supabase.rpc("create_studio_import_batch", {
      p_import_type: "trial_reservations",
      p_original_file_name: file.name,
      p_total_rows: rows.length,
      p_valid_rows: summary.valid + summary.warning
    })

    if (error || typeof batchId !== "string") {
      return {
        status: "error",
        message: "가져오기를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    return {
      status: "success",
      message: "",
      preview: {
        batchId,
        fileName: file.name,
        totalRows: rows.length,
        summary,
        rows
      }
    }
  } catch {
    return {
      status: "error",
      message: "파일을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
