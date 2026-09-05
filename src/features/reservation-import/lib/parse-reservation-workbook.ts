// ⚠️ 서버에서만 호출한다(라우트 핸들러 / server action). exceljs 는 node 런타임 전용이라
//    클라이언트 번들에 들어가면 안 된다. 검증 스크립트에서 직접 부를 수 있도록
//    server-only 마커 대신 이 규칙을 주석으로 둔다.

import ExcelJS from "exceljs"

import {
  RESERVATION_IMPORT_COLUMNS,
  RESERVATION_IMPORT_MAX_ROWS,
  RESERVATION_IMPORT_SHEET,
  type RawReservationRow,
  type ReservationImportColumnKey
} from "@/features/reservation-import/lib/reservation-import-contract"

// 업로드된 workbook 을 행 배열로 바꾼다. 여기서는 DB 를 보지 않고 값만 읽는다.
//
// 파일을 저장하지 않는다. 메모리에서 파싱하고 버린다.
// 수식은 실행하지 않는다 — ExcelJS 가 들고 있는 계산 결과만 읽는다.

export type ParseWorkbookResult =
  | { status: "ok"; rows: RawReservationRow[] }
  | { status: "error"; code: string }

const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] // PK.. (zip)

/** 셀 값을 문자열로 정규화한다. 날짜/시간 셀은 서울 벽시계 표기로 되돌린다. */
const readCellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value

  if (value === null || value === undefined) {
    return ""
  }

  if (value instanceof Date) {
    // ExcelJS 는 날짜 셀을 UTC 기준 Date 로 준다. 사용자가 셀에 적은 숫자를 그대로 복원한다.
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    const hours = String(value.getUTCHours()).padStart(2, "0")
    const minutes = String(value.getUTCMinutes()).padStart(2, "0")

    // 1900-01-00 기준 시간 전용 셀은 날짜가 의미 없다. 시:분만 돌려준다.
    if (year <= 1900) {
      return `${hours}:${minutes}`
    }

    return hours === "00" && minutes === "00"
      ? `${year}-${month}-${day}`
      : `${year}-${month}-${day} ${hours}:${minutes}`
  }

  if (typeof value === "object") {
    // 수식 셀: 저장된 결과만 쓴다. formula 문자열은 평가하지 않는다.
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim()
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim()
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text.trim()
    }

    return ""
  }

  return String(value).trim()
}

export const parseReservationWorkbook = async (
  fileBuffer: ArrayBuffer
): Promise<ParseWorkbookResult> => {
  const bytes = new Uint8Array(fileBuffer.slice(0, XLSX_SIGNATURE.length))
  if (XLSX_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return { status: "error", code: "not_xlsx_file" }
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(fileBuffer)
  } catch {
    return { status: "error", code: "workbook_unreadable" }
  }

  const sheet =
    workbook.getWorksheet(RESERVATION_IMPORT_SHEET.input) ?? workbook.worksheets[0]
  if (!sheet) {
    return { status: "error", code: "input_sheet_missing" }
  }

  // 헤더 행에서 컬럼 위치를 찾는다. 사용자가 열 순서를 바꿔도 읽을 수 있게 한다.
  const headerRow = sheet.getRow(1)
  const columnIndexByKey = new Map<ReservationImportColumnKey, number>()
  headerRow.eachCell((cell, columnNumber) => {
    const header = readCellText(cell).replace(/\s+/g, "")
    const column = RESERVATION_IMPORT_COLUMNS.find(
      (item) => item.header.replace(/\s+/g, "") === header
    )
    if (column && !columnIndexByKey.has(column.key)) {
      columnIndexByKey.set(column.key, columnNumber)
    }
  })

  const missingRequiredHeader = RESERVATION_IMPORT_COLUMNS.filter(
    (column) => column.required !== "optional"
  ).some((column) => !columnIndexByKey.has(column.key))
  if (missingRequiredHeader) {
    return { status: "error", code: "header_mismatch" }
  }

  const rows: RawReservationRow[] = []
  let overflow = false

  sheet.eachRow((row, index) => {
    if (index === 1 || overflow) {
      return
    }

    const entries = RESERVATION_IMPORT_COLUMNS.map((column) => {
      const columnIndex = columnIndexByKey.get(column.key)
      return [column.key, columnIndex ? readCellText(row.getCell(columnIndex)) : ""] as const
    })

    // 전부 빈 행은 무시한다(엑셀 하단의 빈 줄).
    if (entries.every(([, value]) => value.length === 0)) {
      return
    }

    if (rows.length >= RESERVATION_IMPORT_MAX_ROWS) {
      overflow = true
      return
    }

    rows.push({
      ...(Object.fromEntries(entries) as Record<ReservationImportColumnKey, string>),
      rowNumber: index
    })
  })

  if (overflow) {
    return { status: "error", code: "row_limit_exceeded" }
  }

  if (rows.length === 0) {
    return { status: "error", code: "no_rows" }
  }

  return { status: "ok", rows }
}
