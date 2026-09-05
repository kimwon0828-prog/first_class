// 엑셀 행 → 검증된 가져오기 후보.
//
// 여기서는 DB 를 쓰지 않는다. 수업/선생님 목록과 기존 지문만 받아서 판정한다.
// 판정 결과는 화면(Preview)과 실제 저장이 같은 값을 쓴다 — 두 번 계산하지 않는다.

import { createHash } from "node:crypto"

import {
  RESERVATION_IMPORT_ERROR_MESSAGES,
  normalizeReservationImportStatus,
  type RawReservationRow,
  type ReservationImportStatus
} from "@/features/reservation-import/lib/reservation-import-contract"
import { normalizePhoneNumber } from "@/features/notifications/sms/phone"
import { normalizeLearnerGrade } from "@/shared/constants/education-taxonomy"
import { buildSeoulOccurrenceRange, parseSeoulDateTimeLocalToIso } from "@/shared/lib/seoul-datetime"

export type ReservationImportSeverity = "VALID" | "WARNING" | "ERROR"

export type ReservationImportMessage = { code: string; text: string }

/** 저장 단계가 그대로 쓰는 값. 화면은 아래 preview row 만 본다. */
export type ReservationImportWrite = {
  classId: string
  childName: string
  childGrade: string
  childSchool: string | null
  parentName: string | null
  parentPhone: string
  memo: string | null
  status: ReservationImportStatus
  requestedSlotAt: string
  /** 일정 확정 예약만 채운다. 예약 블록을 함께 만든다. */
  confirmedRange: { startAt: string; endAt: string; teacherId: string } | null
}

export type ReservationImportPreviewRow = {
  rowNumber: number
  severity: ReservationImportSeverity
  selected: boolean
  fingerprint: string | null
  studentName: string
  gradeLabel: string
  guardianPhoneMasked: string | null
  className: string
  statusLabel: string
  scheduleLabel: string | null
  messages: ReservationImportMessage[]
  write: ReservationImportWrite | null
}

export type ReservationImportPreview = {
  batchId: string
  fileName: string | null
  totalRows: number
  summary: { valid: number; warning: number; error: number }
  rows: ReservationImportPreviewRow[]
}

export type ReservationImportContext = {
  organizationId: string
  /** 템플릿이 만든 표시 이름 → 수업. 같은 이름이 여럿이면 ambiguous 로 표시한다. */
  classesByLabel: ReadonlyMap<string, { id: string; label: string; ambiguous: boolean }>
  teachersByLabel: ReadonlyMap<string, { id: string; label: string; ambiguous: boolean }>
  /** 이미 가져온 예약의 지문. 자동 병합은 하지 않고 경고만 한다. */
  existingFingerprints: ReadonlySet<string>
  /** 같은 시간대에 이미 일정이 있는지 확인할 때 쓰는 시작 시각 집합. */
  existingScheduleStartAts: ReadonlySet<string>
  now: Date
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{1,2}:\d{2}$/

const message = (code: string): ReservationImportMessage => ({
  code,
  text: RESERVATION_IMPORT_ERROR_MESSAGES[code] ?? "값을 확인해 주세요."
})

const normalizeDate = (value: string) => {
  const trimmed = value.trim().split(" ")[0] ?? ""
  if (DATE_PATTERN.test(trimmed)) {
    return trimmed
  }

  // 2026.9.15 / 2026/9/15 같은 표기도 받아 준다.
  const matched = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!matched) {
    return null
  }

  return `${matched[1]}-${matched[2]!.padStart(2, "0")}-${matched[3]!.padStart(2, "0")}`
}

const normalizeTime = (value: string) => {
  const trimmed = value.trim()
  const timeOnly = trimmed.includes(" ") ? (trimmed.split(" ").pop() ?? "") : trimmed
  if (!TIME_PATTERN.test(timeOnly)) {
    return null
  }

  const [hours, minutes] = timeOnly.split(":")
  const hourNumber = Number(hours)
  const minuteNumber = Number(minutes)
  if (hourNumber > 23 || minuteNumber > 59) {
    return null
  }

  return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`
}

const maskPhone = (value: string) =>
  value.length >= 8 ? `${value.slice(0, 3)}****${value.slice(-4)}` : "****"

/**
 * 같은 예약을 다시 가져오는지 판단하는 지문.
 *
 * 자동 병합·삭제에는 절대 쓰지 않는다. 경고만 한다.
 */
export const buildReservationFingerprint = (input: {
  organizationId: string
  classId: string
  childName: string
  parentPhone: string
  requestedSlotAt: string
}) =>
  createHash("sha256")
    .update(
      [
        input.organizationId,
        input.classId,
        input.childName.replace(/\s+/g, ""),
        input.parentPhone,
        new Date(input.requestedSlotAt).toISOString()
      ].join("|")
    )
    .digest("hex")

export const buildReservationImportPreviewRow = (
  row: RawReservationRow,
  context: ReservationImportContext
): ReservationImportPreviewRow => {
  const errors: ReservationImportMessage[] = []
  const warnings: ReservationImportMessage[] = []

  const childName = row.childName.trim()
  if (!childName) {
    errors.push(message("child_name_required"))
  }

  const childGrade = normalizeLearnerGrade(row.childGrade)
  if (!childGrade) {
    errors.push(message("child_grade_invalid"))
  }

  const rawPhone = row.parentPhone.trim()
  const parentPhone = normalizePhoneNumber(rawPhone)
  if (!rawPhone) {
    errors.push(message("parent_phone_required"))
  } else if (!parentPhone) {
    errors.push(message("parent_phone_invalid"))
  }

  const classLabel = row.className.trim()
  const matchedClass = classLabel ? context.classesByLabel.get(classLabel) : undefined
  if (!classLabel) {
    errors.push(message("class_required"))
  } else if (!matchedClass) {
    errors.push(message("class_not_found"))
  } else if (matchedClass.ambiguous) {
    errors.push(message("class_ambiguous"))
  }

  const status = normalizeReservationImportStatus(row.statusLabel)
  if (!status) {
    errors.push(message("status_invalid"))
  }

  const date = row.date.trim() ? normalizeDate(row.date) : null
  if (!row.date.trim()) {
    errors.push(message("date_required"))
  } else if (!date) {
    errors.push(message("date_invalid"))
  }

  const startTime = row.startTime.trim() ? normalizeTime(row.startTime) : null
  if (!row.startTime.trim()) {
    errors.push(message("start_time_required"))
  } else if (!startTime) {
    errors.push(message("start_time_invalid"))
  }

  const endTimeText = row.endTime.trim()
  const endTime = endTimeText ? normalizeTime(endTimeText) : null
  if (endTimeText && !endTime) {
    errors.push(message("end_time_invalid"))
  }

  const teacherLabel = row.teacherName.trim()
  const matchedTeacher = teacherLabel ? context.teachersByLabel.get(teacherLabel) : undefined
  if (teacherLabel && !matchedTeacher) {
    errors.push(message("teacher_not_found"))
  } else if (matchedTeacher?.ambiguous) {
    errors.push(message("teacher_ambiguous"))
  }

  if (status === "confirmed") {
    if (!endTimeText) {
      errors.push(message("end_time_required_for_confirmed"))
    }
    if (!teacherLabel) {
      errors.push(message("teacher_required_for_confirmed"))
    }
  }

  const requestedSlotAt =
    date && startTime ? parseSeoulDateTimeLocalToIso(`${date}T${startTime}`) : null
  if (date && startTime && !requestedSlotAt) {
    errors.push(message("start_time_invalid"))
  }

  let confirmedRange: ReservationImportWrite["confirmedRange"] = null
  if (status === "confirmed" && date && startTime && endTime && matchedTeacher && !matchedTeacher.ambiguous) {
    const range = buildSeoulOccurrenceRange(date, startTime, endTime)
    if (!range) {
      errors.push(message("end_time_before_start"))
    } else {
      confirmedRange = { ...range, teacherId: matchedTeacher.id }
    }
  }

  const scheduleLabel =
    date && startTime ? `${date} ${startTime}${endTime ? `~${endTime}` : ""}` : null

  let fingerprint: string | null = null
  if (matchedClass && !matchedClass.ambiguous && childName && parentPhone && requestedSlotAt) {
    fingerprint = buildReservationFingerprint({
      organizationId: context.organizationId,
      classId: matchedClass.id,
      childName,
      parentPhone,
      requestedSlotAt
    })

    if (context.existingFingerprints.has(fingerprint)) {
      warnings.push(message("duplicate_candidate"))
    }
  }

  if (requestedSlotAt && new Date(requestedSlotAt).getTime() < context.now.getTime()) {
    warnings.push(message("past_reservation"))
  }

  if (confirmedRange && context.existingScheduleStartAts.has(confirmedRange.startAt)) {
    warnings.push(message("schedule_conflict"))
  }

  const severity: ReservationImportSeverity =
    errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "VALID"

  const write: ReservationImportWrite | null =
    severity === "ERROR" || !matchedClass || !childGrade || !parentPhone || !status || !requestedSlotAt
      ? null
      : {
          classId: matchedClass.id,
          childName,
          childGrade,
          childSchool: row.childSchool.trim() || null,
          parentName: row.parentName.trim() || null,
          parentPhone,
          memo: row.memo.trim() || null,
          status,
          requestedSlotAt,
          confirmedRange
        }

  return {
    rowNumber: row.rowNumber,
    severity,
    // ERROR 는 선택 자체가 불가능하고, WARNING 은 기본 선택 상태로 두되 해제할 수 있다.
    selected: severity !== "ERROR",
    fingerprint,
    studentName: childName || row.childName.trim(),
    gradeLabel: row.childGrade.trim(),
    guardianPhoneMasked: parentPhone ? maskPhone(parentPhone) : null,
    className: classLabel,
    statusLabel: row.statusLabel.trim(),
    scheduleLabel,
    messages: [...errors, ...warnings],
    write
  }
}

export const summarizeReservationImportRows = (rows: ReservationImportPreviewRow[]) => ({
  valid: rows.filter((row) => row.severity === "VALID").length,
  warning: rows.filter((row) => row.severity === "WARNING").length,
  error: rows.filter((row) => row.severity === "ERROR").length
})
