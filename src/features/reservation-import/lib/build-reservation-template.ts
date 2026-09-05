// ⚠️ 서버에서만 호출한다(라우트 핸들러 / server action). exceljs 는 node 런타임 전용이다.

import ExcelJS from "exceljs"

import {
  RESERVATION_IMPORT_COLUMNS,
  RESERVATION_IMPORT_MAX_ROWS,
  RESERVATION_IMPORT_SHEET,
  RESERVATION_IMPORT_STATUS_OPTIONS
} from "@/features/reservation-import/lib/reservation-import-contract"
import { LEARNER_GRADES } from "@/shared/constants/education-taxonomy"

// 학원별 양식을 만든다.
//
// 사용자에게 UUID 를 입력하게 하지 않는다. 수업·선생님은 그 학원의 실제 목록으로
// 드롭다운을 만들고, 서버는 업로드 시 그 이름을 다시 조직 소유로 검증한다.
//
// 전화번호 열은 텍스트 서식으로 고정한다. 숫자로 읽히면 앞자리 0 이 사라진다.

export type ReservationTemplateOption = { label: string }

export type ReservationTemplateInput = {
  academyName: string
  classes: ReservationTemplateOption[]
  teachers: ReservationTemplateOption[]
}

const GRADE_LABELS = LEARNER_GRADES.filter((grade) => grade.group !== "preschool").map(
  (grade) => grade.label
)

/** 엑셀 데이터 검증에 쓰는 목록 문자열. 항목이 너무 길면 별도 시트 참조로 바꾼다. */
const toInlineList = (values: string[]) => `"${values.join(",")}"`

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" }
}

export const buildReservationImportTemplate = async (
  input: ReservationTemplateInput
): Promise<ArrayBuffer> => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "첫수업"
  workbook.created = new Date()

  // ── Sheet 1. 입력 ────────────────────────────────────────────
  const inputSheet = workbook.addWorksheet(RESERVATION_IMPORT_SHEET.input)
  inputSheet.columns = RESERVATION_IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width
  }))

  const headerRow = inputSheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = HEADER_FILL
  headerRow.alignment = { vertical: "middle" }
  inputSheet.views = [{ state: "frozen", ySplit: 1 }]

  const columnIndex = (key: (typeof RESERVATION_IMPORT_COLUMNS)[number]["key"]) =>
    RESERVATION_IMPORT_COLUMNS.findIndex((column) => column.key === key) + 1

  // 전화번호는 반드시 텍스트. 010… 의 앞자리 0 을 지키기 위한 서식이다.
  inputSheet.getColumn(columnIndex("parentPhone")).numFmt = "@"
  inputSheet.getColumn(columnIndex("date")).numFmt = "yyyy-mm-dd"
  inputSheet.getColumn(columnIndex("startTime")).numFmt = "hh:mm"
  inputSheet.getColumn(columnIndex("endTime")).numFmt = "hh:mm"

  const classLabels = input.classes.map((item) => item.label)
  const teacherLabels = input.teachers.map((item) => item.label)

  for (let rowNumber = 2; rowNumber <= RESERVATION_IMPORT_MAX_ROWS + 1; rowNumber += 1) {
    const row = inputSheet.getRow(rowNumber)

    row.getCell(columnIndex("childGrade")).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [toInlineList(GRADE_LABELS)]
    }
    row.getCell(columnIndex("statusLabel")).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [toInlineList(RESERVATION_IMPORT_STATUS_OPTIONS.map((item) => item.label))]
    }

    // 수업·선생님은 개수가 많을 수 있어 선택값 시트를 참조한다.
    if (classLabels.length > 0) {
      row.getCell(columnIndex("className")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'${RESERVATION_IMPORT_SHEET.options}'!$A$2:$A$${classLabels.length + 1}`]
      }
    }
    if (teacherLabels.length > 0) {
      row.getCell(columnIndex("teacherName")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'${RESERVATION_IMPORT_SHEET.options}'!$B$2:$B$${teacherLabels.length + 1}`]
      }
    }

    row.getCell(columnIndex("parentPhone")).numFmt = "@"
  }

  // ── Sheet 2. 작성 방법 ───────────────────────────────────────
  const guideSheet = workbook.addWorksheet(RESERVATION_IMPORT_SHEET.guide)
  guideSheet.columns = [{ width: 96 }]
  const guideLines = [
    `${input.academyName} 체험 예약 가져오기`,
    "",
    "1. `예약 데이터 입력` 시트에 한 행씩 예약을 적어 주세요.",
    "2. 학년 · 수업 · 진행 상태 · 담당 선생님은 목록에서 골라 주세요.",
    "3. 모든 행에 체험 날짜(YYYY-MM-DD)와 시작 시간(HH:mm)이 필요합니다.",
    "4. 진행 상태가 `일정 확정`이면 종료 시간과 담당 선생님도 필요합니다.",
    "5. 보호자 연락처는 010-1234-5678 처럼 적어 주세요. 앞자리 0 이 사라지지 않도록 텍스트 서식으로 되어 있습니다.",
    "6. 시간은 모두 한국 시간(KST) 기준입니다.",
    `7. 한 번에 최대 ${RESERVATION_IMPORT_MAX_ROWS}행까지 가져올 수 있습니다.`,
    "",
    "가져오기 전에 확인 화면에서 오류·경고를 먼저 보여 드립니다.",
    "체험 결과와 상담 기록은 이 양식으로 가져오지 않습니다."
  ]
  guideLines.forEach((line, index) => {
    const row = guideSheet.getRow(index + 1)
    row.getCell(1).value = line
    if (index === 0) {
      row.font = { bold: true, size: 14 }
    }
  })

  // ── Sheet 3. 선택값 ──────────────────────────────────────────
  const optionSheet = workbook.addWorksheet(RESERVATION_IMPORT_SHEET.options)
  optionSheet.columns = [
    { header: "수업", key: "className", width: 34 },
    { header: "담당 선생님", key: "teacherName", width: 20 },
    { header: "학년", key: "grade", width: 12 },
    { header: "진행 상태", key: "status", width: 14 }
  ]
  optionSheet.getRow(1).font = { bold: true }
  optionSheet.getRow(1).fill = HEADER_FILL

  const optionRowCount = Math.max(
    classLabels.length,
    teacherLabels.length,
    GRADE_LABELS.length,
    RESERVATION_IMPORT_STATUS_OPTIONS.length
  )
  for (let index = 0; index < optionRowCount; index += 1) {
    optionSheet.getRow(index + 2).values = [
      classLabels[index] ?? null,
      teacherLabels[index] ?? null,
      GRADE_LABELS[index] ?? null,
      RESERVATION_IMPORT_STATUS_OPTIONS[index]?.label ?? null
    ]
  }

  // 실수로 고치지 않도록 잠근다(비밀번호가 목적이 아니라 오조작 방지다).
  await optionSheet.protect("firstclass", { selectLockedCells: true })

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}
