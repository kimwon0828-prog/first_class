// 예약 가져오기 양식 · 파서 · 검증 규칙 검증.
//
//   npx tsx scripts/verify-reservation-import-workbook.ts
//
// DB 없이 도는 순수 검증이다. 여기서 고정하는 계약.
//   1. 학원별 양식이 3개 시트로 만들어지고, 그 양식을 그대로 다시 읽을 수 있다.
//   2. 엑셀에 적은 한국 시간이 9시간 밀리지 않는다.
//   3. 상태·학년·수업·선생님 매핑이 사용자 문구 → canonical 값으로 변환된다.
//   4. 일정 확정 행은 종료 시간과 담당 선생님이 없으면 ERROR 다(reviewing 으로 낮추지 않는다).
//   5. 중복 후보·지난 날짜는 WARNING 이고 기본 선택 상태다.
//   6. 최대 행 수를 넘기면 파일 전체를 거절한다.

import ExcelJS from "exceljs"

import { buildReservationImportTemplate } from "@/features/reservation-import/lib/build-reservation-template"
import { parseReservationWorkbook } from "@/features/reservation-import/lib/parse-reservation-workbook"
import {
  RESERVATION_IMPORT_MAX_ROWS,
  RESERVATION_IMPORT_SHEET
} from "@/features/reservation-import/lib/reservation-import-contract"
import {
  buildReservationFingerprint,
  buildReservationImportPreviewRow,
  summarizeReservationImportRows,
  type ReservationImportContext
} from "@/features/reservation-import/lib/reservation-import-preview"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}
const passLine = (before: number, message: string) => {
  if (failures === before) {
    console.log(`  PASS  ${message}`)
  }
}

const ORG_ID = "11111111-1111-1111-1111-111111111111"
const CLASS_ID = "33333333-3333-3333-3333-333333333331"
const TEACHER_ID = "22222222-2222-2222-2222-222222222221"

const context = (overrides?: Partial<ReservationImportContext>): ReservationImportContext => ({
  organizationId: ORG_ID,
  classesByLabel: new Map([
    ["미술 체험", { id: CLASS_ID, label: "미술 체험", ambiguous: false }],
    ["같은이름 수업", { id: CLASS_ID, label: "같은이름 수업", ambiguous: true }]
  ]),
  teachersByLabel: new Map([
    ["김선생", { id: TEACHER_ID, label: "김선생", ambiguous: false }]
  ]),
  existingFingerprints: new Set(),
  existingScheduleStartAts: new Set(),
  now: new Date("2026-09-01T00:00:00.000Z"),
  ...overrides
})

const emptyRow = (rowNumber: number) => ({
  rowNumber,
  childName: "",
  childGrade: "",
  parentName: "",
  parentPhone: "",
  className: "",
  statusLabel: "",
  date: "",
  startTime: "",
  endTime: "",
  teacherName: "",
  childSchool: "",
  memo: ""
})

const row = (rowNumber: number, overrides: Partial<ReturnType<typeof emptyRow>>) => ({
  ...emptyRow(rowNumber),
  ...overrides
})

const run = async () => {
  // ─────────────────────────────────────────────────────────
  console.log("\n[1] 양식 생성 · 재파싱")
  let templateBuffer: ArrayBuffer
  {
    const before = failures
    templateBuffer = await buildReservationImportTemplate({
      academyName: "검증 학원",
      classes: [{ label: "미술 체험" }, { label: "파이썬 기초 · 월 16:00" }],
      teachers: [{ label: "김선생" }]
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(templateBuffer)
    const names = workbook.worksheets.map((sheet) => sheet.name)
    check(
      names.includes(RESERVATION_IMPORT_SHEET.input) &&
        names.includes(RESERVATION_IMPORT_SHEET.guide) &&
        names.includes(RESERVATION_IMPORT_SHEET.options),
      `시트 구성이 다르다: ${names.join(", ")}`
    )

    const inputSheet = workbook.getWorksheet(RESERVATION_IMPORT_SHEET.input)!
    check(inputSheet.getRow(1).getCell(1).value === "학생 이름", "입력 시트 헤더가 다르다")
    check(inputSheet.getColumn(4).numFmt === "@", "보호자 연락처 열이 텍스트 서식이 아니다")
    check(
      Boolean(inputSheet.getRow(2).getCell(6).dataValidation),
      "진행 상태 드롭다운이 없다"
    )
    passLine(before, `3개 시트 · 전화번호 텍스트 서식 · 드롭다운 (${templateBuffer.byteLength} bytes)`)
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[2] 날짜·시간 셀 파싱 (KST 유지)")
  {
    const before = failures
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(templateBuffer)
    const sheet = workbook.getWorksheet(RESERVATION_IMPORT_SHEET.input)!
    const target = sheet.getRow(2)
    target.getCell(1).value = "김민수"
    target.getCell(2).value = "초3"
    target.getCell(3).value = "김보호"
    target.getCell(4).value = "010-1111-2222"
    target.getCell(5).value = "미술 체험"
    target.getCell(6).value = "일정 확정"
    // 날짜 셀(Date)과 문자열 시간이 섞여 들어오는 실제 상황을 그대로 재현한다.
    target.getCell(7).value = new Date(Date.UTC(2026, 8, 15))
    target.getCell(8).value = "16:00"
    target.getCell(9).value = "17:00"
    target.getCell(10).value = "김선생"
    const filled = (await workbook.xlsx.writeBuffer()) as ArrayBuffer

    const parsed = await parseReservationWorkbook(filled)
    check(parsed.status === "ok", `파싱 실패: ${JSON.stringify(parsed)}`)
    if (parsed.status !== "ok") {
      return
    }

    check(parsed.rows.length === 1, `행 수가 다르다: ${parsed.rows.length}`)
    check(parsed.rows[0]?.date === "2026-09-15", `날짜 파싱이 다르다: ${parsed.rows[0]?.date}`)
    check(parsed.rows[0]?.startTime === "16:00", `시작 시간이 다르다: ${parsed.rows[0]?.startTime}`)

    const preview = buildReservationImportPreviewRow(parsed.rows[0]!, context())
    check(preview.severity === "VALID", `기대와 다른 판정: ${JSON.stringify(preview.messages)}`)
    const startParts = getSeoulDateTimeParts(preview.write!.confirmedRange!.startAt)
    const endParts = getSeoulDateTimeParts(preview.write!.confirmedRange!.endAt)
    check(
      startParts?.hour === 16 && startParts?.minute === 0,
      `서울 시각이 밀렸다: ${JSON.stringify(startParts)}`
    )
    check(endParts?.hour === 17, `종료 서울 시각이 밀렸다: ${JSON.stringify(endParts)}`)
    check(preview.write?.requestedSlotAt === preview.write?.confirmedRange?.startAt,
      "확정 예약의 희망 시각과 확정 시각이 다르다")
    passLine(before, "엑셀 16:00 → DB 16:00 KST (9시간 drift 0)")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[3] 상태·학년 매핑")
  {
    const before = failures
    const base = { childName: "김학생", parentPhone: "01011112222", className: "미술 체험", date: "2026-09-20", startTime: "10:00" }
    const newRow = buildReservationImportPreviewRow(
      row(2, { ...base, childGrade: "초3", statusLabel: "신규 신청" }),
      context()
    )
    const reviewingRow = buildReservationImportPreviewRow(
      row(3, { ...base, childGrade: "중1", statusLabel: "신청 확인" }),
      context()
    )
    check(newRow.write?.status === "new", `신규 신청 매핑 실패: ${newRow.write?.status}`)
    check(newRow.write?.childGrade === "elem_3", `학년 매핑 실패: ${newRow.write?.childGrade}`)
    check(reviewingRow.write?.status === "reviewing", "신청 확인 매핑 실패")
    check(reviewingRow.write?.childGrade === "middle_1", "중학년 매핑 실패")
    check(newRow.write?.confirmedRange === null, "확정이 아닌데 예약 블록 정보가 만들어졌다")
    passLine(before, "신규 신청/신청 확인 → new/reviewing · 초3/중1 → elem_3/middle_1")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[4] 일정 확정 필수값")
  {
    const before = failures
    const base = {
      childName: "김학생",
      childGrade: "초3",
      parentPhone: "01011112222",
      className: "미술 체험",
      statusLabel: "일정 확정",
      date: "2026-09-20",
      startTime: "16:00"
    }
    const noEnd = buildReservationImportPreviewRow(row(2, { ...base, teacherName: "김선생" }), context())
    const noTeacher = buildReservationImportPreviewRow(row(3, { ...base, endTime: "17:00" }), context())
    const reversed = buildReservationImportPreviewRow(
      row(4, { ...base, endTime: "15:00", teacherName: "김선생" }),
      context()
    )

    check(noEnd.severity === "ERROR", "종료 시간 없는 확정이 통과했다")
    check(
      noEnd.messages.some((item) => item.code === "end_time_required_for_confirmed"),
      "종료 시간 오류 코드가 없다"
    )
    check(noTeacher.severity === "ERROR", "담당 선생님 없는 확정이 통과했다")
    check(
      noTeacher.messages.some((item) => item.code === "teacher_required_for_confirmed"),
      "담당 선생님 오류 코드가 없다"
    )
    // 자동으로 reviewing 으로 낮춰 저장하지 않는다.
    check(noTeacher.write === null, "확정 실패 행이 저장 대상으로 남았다")
    check(noEnd.selected === false, "ERROR 행이 선택 상태다")
    check(reversed.severity === "ERROR", "종료가 시작보다 빠른데 통과했다")
    passLine(before, "확정 행은 종료 시간·담당 선생님 필수 (reviewing 강등 없음)")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[5] 매핑 실패 · 중복 후보 · 지난 날짜")
  {
    const before = failures
    const base = {
      childName: "김학생",
      childGrade: "초3",
      parentPhone: "01011112222",
      statusLabel: "신규 신청",
      date: "2026-09-20",
      startTime: "10:00"
    }
    const unknownClass = buildReservationImportPreviewRow(
      row(2, { ...base, className: "없는 수업" }),
      context()
    )
    const ambiguous = buildReservationImportPreviewRow(
      row(3, { ...base, className: "같은이름 수업" }),
      context()
    )
    const badPhone = buildReservationImportPreviewRow(
      row(4, { ...base, className: "미술 체험", parentPhone: "1234" }),
      context()
    )
    check(unknownClass.messages.some((item) => item.code === "class_not_found"), "수업 없음 미검출")
    check(ambiguous.messages.some((item) => item.code === "class_ambiguous"), "동명 수업 미검출")
    check(badPhone.messages.some((item) => item.code === "parent_phone_invalid"), "연락처 오류 미검출")

    const valid = buildReservationImportPreviewRow(
      row(5, { ...base, className: "미술 체험" }),
      context()
    )
    const fingerprint = buildReservationFingerprint({
      organizationId: ORG_ID,
      classId: CLASS_ID,
      childName: "김학생",
      parentPhone: "01011112222",
      requestedSlotAt: valid.write!.requestedSlotAt
    })
    check(valid.fingerprint === fingerprint, "지문 계산이 재현되지 않는다")

    const duplicate = buildReservationImportPreviewRow(
      row(6, { ...base, className: "미술 체험" }),
      context({ existingFingerprints: new Set([fingerprint]) })
    )
    check(duplicate.severity === "WARNING", `중복 후보가 WARNING 이 아니다: ${duplicate.severity}`)
    check(duplicate.selected, "WARNING 이 기본 선택 상태가 아니다")
    check(duplicate.write !== null, "WARNING 행이 저장 대상에서 빠졌다")

    const past = buildReservationImportPreviewRow(
      row(7, { ...base, className: "미술 체험", date: "2026-08-01" }),
      context()
    )
    check(past.messages.some((item) => item.code === "past_reservation"), "지난 날짜 경고 미검출")
    check(past.severity === "WARNING", "지난 날짜가 WARNING 이 아니다")
    passLine(before, "매핑 실패는 ERROR · 중복 후보/지난 날짜는 선택 가능한 WARNING")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[6] 행 수 상한")
  {
    const before = failures
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(RESERVATION_IMPORT_SHEET.input)
    sheet.getRow(1).values = [
      "학생 이름", "학년", "보호자 이름", "보호자 연락처", "수업", "진행 상태",
      "체험 날짜", "시작 시간", "종료 시간", "담당 선생님", "학교", "신청 메모"
    ]
    for (let index = 0; index < RESERVATION_IMPORT_MAX_ROWS + 1; index += 1) {
      sheet.getRow(index + 2).values = [
        `학생${index}", "초3`, "초3", "보호자", "01011112222", "미술 체험", "신규 신청",
        "2026-09-20", "10:00"
      ]
    }
    const overflow = await parseReservationWorkbook((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
    check(
      overflow.status === "error" && overflow.code === "row_limit_exceeded",
      `상한 초과가 거절되지 않았다: ${JSON.stringify(overflow)}`
    )

    const notXlsx = await parseReservationWorkbook(new TextEncoder().encode("hello,world").buffer as ArrayBuffer)
    check(
      notXlsx.status === "error" && notXlsx.code === "not_xlsx_file",
      "xlsx 아닌 파일이 통과했다"
    )
    passLine(before, `${RESERVATION_IMPORT_MAX_ROWS}행 초과 · 비 xlsx 파일 거절`)
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[7] 요약 집계")
  {
    const before = failures
    const summary = summarizeReservationImportRows([
      { severity: "VALID" },
      { severity: "WARNING" },
      { severity: "ERROR" },
      { severity: "VALID" }
    ] as never)
    check(
      summary.valid === 2 && summary.warning === 1 && summary.error === 1,
      `요약이 다르다: ${JSON.stringify(summary)}`
    )
    passLine(before, "정상 2 · 확인 필요 1 · 오류 1")
  }

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 예약 가져오기 양식·파서 검증 완료")
}

run().catch((error) => {
  console.error("\n검증 중 예외:", error)
  process.exit(1)
})
