// 예약 가져오기의 canonical 계약.
//
// 엑셀 사용자에게 DB enum(new/reviewing/confirmed)을 보여주지 않는다.
// 화면 문구와 저장 값의 매핑은 여기 한 곳에만 둔다.

import type { ApplicationStatus } from "@/shared/lib/db/adapter"

export const RESERVATION_IMPORT_SHEET = {
  input: "예약 데이터 입력",
  guide: "작성 방법",
  options: "선택값 안내"
} as const

/** v1 이 가져올 수 있는 상태. 체험 완료·취소·노쇼는 이번 범위가 아니다. */
export const RESERVATION_IMPORT_STATUS_OPTIONS = [
  { label: "신규 신청", value: "new" },
  { label: "신청 확인", value: "reviewing" },
  { label: "일정 확정", value: "confirmed" }
] as const satisfies ReadonlyArray<{ label: string; value: ApplicationStatus }>

export type ReservationImportStatus =
  (typeof RESERVATION_IMPORT_STATUS_OPTIONS)[number]["value"]

const statusByLabel = new Map<string, ReservationImportStatus>(
  RESERVATION_IMPORT_STATUS_OPTIONS.map((item) => [item.label, item.value])
)

export const normalizeReservationImportStatus = (
  value: string | null | undefined
): ReservationImportStatus | null => {
  const normalized = String(value ?? "").replace(/\s+/g, "").trim()
  if (!normalized) {
    return null
  }

  for (const [label, status] of statusByLabel) {
    if (label.replace(/\s+/g, "") === normalized) {
      return status
    }
  }

  return null
}

export const RESERVATION_IMPORT_COLUMNS = [
  { key: "childName", header: "학생 이름", width: 14, required: "always" },
  { key: "childGrade", header: "학년", width: 10, required: "always" },
  { key: "parentName", header: "보호자 이름", width: 14, required: "optional" },
  { key: "parentPhone", header: "보호자 연락처", width: 18, required: "always" },
  { key: "className", header: "수업", width: 30, required: "always" },
  { key: "statusLabel", header: "진행 상태", width: 14, required: "always" },
  { key: "date", header: "체험 날짜", width: 14, required: "always" },
  { key: "startTime", header: "시작 시간", width: 12, required: "always" },
  { key: "endTime", header: "종료 시간", width: 12, required: "confirmed" },
  { key: "teacherName", header: "담당 선생님", width: 16, required: "confirmed" },
  { key: "childSchool", header: "학교", width: 18, required: "optional" },
  { key: "memo", header: "신청 메모", width: 30, required: "optional" }
] as const

export type ReservationImportColumnKey = (typeof RESERVATION_IMPORT_COLUMNS)[number]["key"]

/** 엑셀 한 행을 읽은 그대로의 값. 정규화 전이다. */
export type RawReservationRow = Record<ReservationImportColumnKey, string> & {
  rowNumber: number
}

export const RESERVATION_IMPORT_MAX_ROWS = 300
export const RESERVATION_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024

export const RESERVATION_IMPORT_ERROR_MESSAGES: Record<string, string> = {
  child_name_required: "학생 이름을 입력해 주세요.",
  child_grade_invalid: "학년을 선택값에서 골라 주세요.",
  parent_phone_required: "보호자 연락처를 입력해 주세요.",
  parent_phone_invalid: "보호자 연락처 형식을 확인해 주세요.",
  class_required: "수업을 선택해 주세요.",
  class_not_found: "수업을 찾을 수 없습니다.",
  class_ambiguous: "같은 이름의 수업이 여러 개입니다. 선택값 시트의 이름을 그대로 입력해 주세요.",
  status_invalid: "진행 상태를 선택값에서 골라 주세요.",
  date_required: "체험 날짜를 입력해 주세요.",
  date_invalid: "체험 날짜 형식을 확인해 주세요(YYYY-MM-DD).",
  start_time_required: "시작 시간을 입력해 주세요.",
  start_time_invalid: "시작 시간 형식을 확인해 주세요(HH:mm).",
  end_time_required_for_confirmed: "일정 확정 예약은 종료 시간이 필요합니다.",
  end_time_invalid: "종료 시간 형식을 확인해 주세요(HH:mm).",
  end_time_before_start: "종료 시간이 시작 시간보다 빠릅니다.",
  teacher_required_for_confirmed: "일정 확정 예약은 담당 선생님이 필요합니다.",
  teacher_not_found: "담당 선생님을 찾을 수 없습니다.",
  teacher_ambiguous: "같은 이름의 선생님이 여러 명입니다. 선택값 시트의 이름을 그대로 입력해 주세요.",
  duplicate_candidate: "이미 가져온 예약으로 보입니다.",
  past_reservation: "지난 날짜입니다. 그대로 가져오면 지난 예약으로 저장됩니다.",
  schedule_conflict: "같은 시간에 등록된 일정이 있습니다.",
  row_limit_exceeded: `한 번에 ${RESERVATION_IMPORT_MAX_ROWS}행까지 가져올 수 있습니다.`
}
