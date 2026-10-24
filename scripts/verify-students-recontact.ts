// 학생 · 안내 보내기(2차-3) 규칙 검증(순수 함수 · DB 없음).
//
//   npx tsx scripts/verify-students-recontact.ts
//
//   1. 학생 묶기: child_id · 학부모 계정 + 이름 · 엑셀(번호 + 이름) · 파기 제외 · 대표 신청
//   2. 학생 결과 · 탭(다시 연락할 학생 = 미등록 + 고민 중) · 사유 이름(앱 목록 그대로)
//   3. 고를 수 없는 학생(엑셀 · 동의 안 함 · 번호 없음) · 마지막 연락
//   4. 문자: 첫 줄 "(광고) [학원명] 대표번호" · 인사 치환 · 링크 · 080 · 바이트
//   5. 막는 이유 순서: 요금제 → 로컬 가드 → 080 → 대표번호 → 시간(21~8시) → 고른 학생 → 50명 → 한도

import {
  buildStudentListRows,
  groupStudentApplications,
  isStudentInTab,
  resolveLastContact,
  resolveStudentResult
} from "@/features/students/lib/student-grouping"
import {
  buildRecontactBodyTemplate,
  estimateSmsBytes,
  isValidOptOutNumber,
  isWithinRecontactHours,
  renderRecontactMessage,
  toFriendlyStudentName
} from "@/features/students/lib/recontact-message"
import { resolveRecontactBlock } from "@/features/students/lib/recontact-gate"
import { STUDIO_STUDENT_RESULT_LABELS, STUDIO_STUDENT_RESULT_TONES } from "@/features/studio/lib/application-status-labels"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const NOW = new Date("2026-10-24T03:00:00.000Z") // 10월 24일 12:00 KST

const app = (id: string, patch: Partial<StudioApplicationSummary> = {}): StudioApplicationSummary => ({
  id,
  classId: "class-1",
  classTitle: "로봇 코딩 체험",
  classProgramType: "trial_class",
  academyName: null,
  teacherDisplayName: null,
  organizationAddress: null,
  organizationAddressDetail: null,
  parentId: "parent-1",
  childName: "정하람",
  childGrade: "elem_4",
  parentName: "김지현",
  parentPhone: "010-4021-7713",
  requestedScheduleBlockId: null,
  requestedSlotAt: "2026-09-21T07:00:00.000Z",
  confirmedSlotAt: "2026-09-21T07:00:00.000Z",
  registrationStatus: "not_enrolled",
  status: "completed",
  goalType: null,
  createdAt: "2026-09-18T13:05:00.000Z",
  updatedAt: "2026-09-28T05:30:00.000Z",
  classSubject: "coding",
  classSubjectCategory: "coding_it_robotics",
  classRegion: null,
  classAssignmentMode: "preassigned",
  scheduleStartTime: null,
  scheduleEndTime: null,
  confirmedBlockStartAt: null,
  confirmedBlockEndAt: null,
  assignedTeacherId: null,
  assignedTeacherName: null,
  contactedAt: null,
  scheduledAt: null,
  completedAt: "2026-09-21T08:00:00.000Z",
  canceledAt: null,
  noShowAt: null,
  enrolledAt: null,
  lostAt: "2026-09-28T05:30:00.000Z",
  unregisteredReason: null,
  registrationReasonIds: ["schedule_mismatch"],
  childId: "child-1",
  interestSubjects: "코딩",
  ...patch
})

// ── 1. 학생 묶기 ──────────────────────────────────────────────
{
  const groups = groupStudentApplications([
    app("a1"),
    // child_id 가 없는 옛 신청: 같은 학부모 계정 + 같은 이름이면 같은 학생
    app("a2", { childId: null, createdAt: "2026-08-01T00:00:00.000Z" }),
    // 형제(다른 child_id, 같은 학부모)는 다른 학생
    app("a3", { childId: "child-2", childName: "정하윤" }),
    // 엑셀: 학부모 계정 없음 → 번호 + 이름. 앱 신청과는 합치지 않는다.
    app("x1", { parentId: null, childId: null, parentPhone: "010 4021 7713" }),
    app("x2", { parentId: null, childId: null, parentPhone: "01040217713", createdAt: "2026-07-01T00:00:00.000Z" }),
    // 파기된 신청은 보이지 않는다
    app("gone", { personalDataErased: true, childName: "학생 정보 삭제됨", parentId: null, childId: null })
  ])
  const byIds = groups.map((group) => group.applications.map((item) => item.id).sort().join(",")).sort()
  check("child_id + 학부모·이름으로 옛 신청을 잇는다", byIds.includes("a1,a2"), byIds.join(" | "))
  check("형제는 다른 학생", byIds.includes("a3"))
  check("엑셀은 번호(숫자만) + 이름으로 묶고 앱 신청과 합치지 않는다", byIds.includes("x1,x2"))
  check("파기된 신청은 학생이 아니다", !byIds.some((ids) => ids.includes("gone")))
  check("학생 3명(하람 · 하윤 · 엑셀 하람)", groups.length === 3)

  const withCancel = groupStudentApplications([
    app("old", { createdAt: "2026-08-01T00:00:00.000Z" }),
    app("new", { status: "canceled", canceledAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" })
  ])
  check("대표 신청 = 최근의 취소 · 불참 아닌 신청", withCancel[0].representative.id === "old")
}

// ── 2. 결과 · 탭 · 사유 ───────────────────────────────────────
{
  const none = new Set<string>()
  check("미등록", resolveStudentResult(app("a"), none) === "not_enrolled")
  check("등록 결과 고민 중", resolveStudentResult(app("a", { registrationStatus: "pending" }), none) === "considering")
  check("학부모 의향 고민 중", resolveStudentResult(app("a", { registrationStatus: "undecided" }), new Set(["a"])) === "considering")
  check("결정 전", resolveStudentResult(app("a", { registrationStatus: "undecided" }), none) === "undecided")
  check("체험 전은 진행 중", resolveStudentResult(app("a", { status: "confirmed", registrationStatus: "undecided" }), none) === "in_progress")
  check("불참은 취소·불참", resolveStudentResult(app("a", { noShowAt: "2026-09-21T07:00:00.000Z" }), none) === "canceled")
  check("다시 연락할 학생 = 미등록 + 고민 중",
    isStudentInTab("not_enrolled", "recontact") && isStudentInTab("considering", "recontact") && !isStudentInTab("undecided", "recontact") && !isStudentInTab("enrolled", "recontact"))
  check("진행 중 탭 = 체험 전 + 결정 전", isStudentInTab("in_progress", "in_progress") && isStudentInTab("undecided", "in_progress"))
  check("Figma 배지: 미등록 red · 고민 중 amber",
    STUDIO_STUDENT_RESULT_LABELS.not_enrolled === "미등록" && STUDIO_STUDENT_RESULT_TONES.not_enrolled === "red" &&
    STUDIO_STUDENT_RESULT_LABELS.considering === "고민 중" && STUDIO_STUDENT_RESULT_TONES.considering === "amber")

  const rows = buildStudentListRows({
    groups: groupStudentApplications([
      app("a1"),
      app("b1", { childId: "child-b", childName: "문서윤", parentId: "parent-2", parentPhone: "010-1111-2222", registrationStatus: "pending", registrationReasonIds: ["comparing_academies"] }),
      app("c1", { childId: "child-c", childName: "서지호", parentId: "parent-3", registrationReasonIds: [], unregisteredReason: "class_level_mismatch" }),
      app("x1", { parentId: null, childId: null, childName: "조하준", parentPhone: "010-9999-0000" })
    ]),
    consideringIds: new Set(),
    consents: [
      { parentId: "parent-1", consented: true, consentedAt: "2026-09-18T13:05:00.000Z", withdrawnAt: null },
      { parentId: "parent-2", consented: false, consentedAt: "2026-09-01T00:00:00.000Z", withdrawnAt: "2026-09-20T00:00:00.000Z" }
    ],
    events: [],
    now: NOW
  })
  const row = (name: string) => rows.find((item) => item.name === name)!
  check("사유 이름은 앱 목록 그대로(희망 시간 불일치)", row("정하람").reason === "희망 시간 불일치", String(row("정하람").reason))
  check("고민 중 사유(다른 학원과 비교 중)", row("문서윤").reason === "다른 학원과 비교 중")
  check("옛 단일 사유는 새 분류로(원하는 과정·레벨 없음)", row("서지호").reason === "원하는 과정·레벨 없음")
  check("수업 아래 줄 \"9월 체험 · 관심 코딩\"", row("정하람").classSub === "9월 체험 · 관심 코딩", row("정하람").classSub)
  check("문자 치환용 체험 \"9월 로봇 코딩 체험\"", row("정하람").trialLabel === "9월 로봇 코딩 체험")

  // ── 3. 고를 수 없는 학생 ──
  check("동의한 보호자는 고를 수 있다", row("정하람").lock === null)
  check("철회한 보호자는 잠긴다", row("문서윤").lock === "no_consent")
  check("동의 기록이 없으면 잠긴다", row("서지호").lock === "no_consent")
  check("엑셀 학생은 잠긴다(학부모 계정 없음)", row("조하준").lock === "no_account")
  check("목록 행에 전화번호 · 메모가 없다", !JSON.stringify(rows).includes("010-") && !JSON.stringify(rows).includes("note"))
}

{
  const items = [app("a1")]
  const last = resolveLastContact(items, [
    { kind: "consultation", applicationId: "a1", at: "2026-09-28T05:30:00.000Z", channel: "OTHER", note: null, authorName: null },
    { kind: "report", applicationId: "a1", at: "2026-09-22T09:10:00.000Z" },
    { kind: "recontact", applicationId: "a1", at: "2026-10-12T02:00:00.000Z", status: "failed", templateKind: "new_class" },
    { kind: "consultation", applicationId: "other", at: "2026-10-20T00:00:00.000Z", channel: "PHONE", note: null, authorName: null }
  ])
  check("마지막 연락 = 가장 최근(보내지 못한 문자 · 다른 학생 기록은 빼고)", last?.kind === "상담 메모" && last.at === "2026-09-28T05:30:00.000Z", JSON.stringify(last))
  const phone = resolveLastContact(items, [{ kind: "consultation", applicationId: "a1", at: "2026-10-02T00:00:00.000Z", channel: "PHONE", note: null, authorName: null }])
  check("전화 상담은 \"전화\"", phone?.kind === "전화")
  check("기록이 없으면 신청", resolveLastContact(items, [])?.kind === "신청")
}

// ── 4. 문자 ──────────────────────────────────────────────────
{
  check("정하람 → 하람이", toFriendlyStudentName("정하람") === "하람이")
  check("윤서아 → 서아", toFriendlyStudentName("윤서아") === "서아")
  check("두 글자는 그대로(지우)", toFriendlyStudentName("지우") === "지우")
  const template = buildRecontactBodyTemplate({ kind: "new_class", classTitle: "로봇 코딩 · 토요일 오전 새 반", customText: "" })
  check("저장하는 템플릿에 학생 이름이 없다", template.includes("{학생}") && template.includes("{체험}") && !template.includes("하람"))
  const message = renderRecontactMessage({
    academyName: "중계 코딩랩",
    academyPhone: "02-930-1234",
    bodyTemplate: template,
    studentName: "정하람",
    trialLabel: "9월 로봇 코딩 체험",
    linkUrl: "https://firstsuup.com/classes/class-1",
    optOutNumber: "080-000-0000"
  })
  const lines = message.split("\n")
  check("첫 줄 (광고) [학원명] 학원대표번호", lines[0] === "(광고) [중계 코딩랩] 02-930-1234", lines[0])
  check("인사 치환", lines[1] === "하람이 보호자님, 지난 9월 로봇 코딩 체험에 와 주셔서 감사했어요.", lines[1])
  check("수업 링크 줄", lines.includes("수업 보기·체험 신청 ▶ https://firstsuup.com/classes/class-1"))
  check("끝 줄 무료수신거부", lines.at(-1) === "무료수신거부 080-000-0000")
  check("LMS 한도 안(2,000바이트)", estimateSmsBytes(message) < 2000, String(estimateSmsBytes(message)))
  const custom = buildRecontactBodyTemplate({ kind: "custom", classTitle: null, customText: "  토요일 반 신청을 받아요.\r\n편하게 연락 주세요. " })
  check("직접 쓰기는 글 그대로 + 인사 줄", custom.endsWith("토요일 반 신청을 받아요.\n편하게 연락 주세요.") && custom.startsWith("{학생} 보호자님"))
  check("080 형식", isValidOptOutNumber("080-000-0000") && isValidOptOutNumber("0801234567") && !isValidOptOutNumber("02-123-4567") && !isValidOptOutNumber(null))
}

// ── 5. 막는 이유 ─────────────────────────────────────────────
{
  const at = (hourKst: number, minute = 0) => new Date(Date.UTC(2026, 9, 24, hourKst - 9, minute))
  check("08:00 KST 부터 보낸다", isWithinRecontactHours(at(8)) && !isWithinRecontactHours(at(7, 59)))
  check("21:00 KST 부터 못 보낸다", isWithinRecontactHours(at(20, 59)) && !isWithinRecontactHours(at(21)))
  const ok = { entitled: true, localGuardAllowed: true, optOutNumber: "080-000-0000", senderPhone: "02-930-1234", now: at(12), selectedCount: 3, remaining: 182 }
  check("모두 갖추면 보낸다", resolveRecontactBlock(ok) === null)
  check("무료 플랜이 먼저", resolveRecontactBlock({ ...ok, entitled: false, senderPhone: null, now: at(22) }) === "plan")
  check("개발 환경 로컬 가드", resolveRecontactBlock({ ...ok, localGuardAllowed: false }) === "local_guard")
  check("080 번호 없음", resolveRecontactBlock({ ...ok, optOutNumber: null }) === "opt_out_number")
  check("학원 대표번호 없음", resolveRecontactBlock({ ...ok, senderPhone: " " }) === "sender_phone")
  check("밤 9시~아침 8시", resolveRecontactBlock({ ...ok, now: at(21, 30) }) === "quiet_hours")
  check("고른 학생 없음", resolveRecontactBlock({ ...ok, selectedCount: 0 }) === "no_recipient")
  check("한 번에 50명", resolveRecontactBlock({ ...ok, selectedCount: 51, remaining: 200 }) === "too_many")
  check("남은 발송보다 많으면 한도", resolveRecontactBlock({ ...ok, selectedCount: 5, remaining: 4 }) === "limit")
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
