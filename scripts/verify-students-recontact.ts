// 학생 · 학원 소식 보내기 규칙 검증(순수 함수 · DB 없음).
//
//   npx tsx scripts/verify-students-recontact.ts
//
//   1. 학생 묶기: child_id · 학부모 계정 + 이름 · 엑셀(번호 + 이름) · 파기 제외 · 대표 신청
//   2. 학생 결과 · 탭(다시 연락할 학생 = 미등록 + 고민 중) · 사유 이름(앱 목록 그대로)
//      홈 "다시 연락할 학생" 카드 = 학생 탭과 같은 함수(건수 · 아바타 · 요일 문장)
//      원하는 요일: 학부모 희망 요일 먼저, 없으면 상담 기록(홈 · 분석 · 학생 상세 같은 함수)
//   3. 고를 수 없는 학생(엑셀 · 동의 안 함 · 번호 없음) · 마지막 연락
//   4. 문자: 첫 줄 "(광고) [첫수업] 고객센터 번호" · 둘째 줄 "[학원명] 하람이 보호자님" · 링크 · 080 · 바이트
//   5. 막는 이유 순서: 요금제 → 로컬 가드 → 080 → 대표번호 → 시간(21~8시) → 고른 학생 → 50명 → 한도

import {
  STUDENT_LOCK_LABELS,
  buildRecontactStudents,
  buildStudentListRows,
  getStudentDecisionApplicationIds,
  groupStudentApplications,
  isStudentInTab,
  resolveLastContact,
  resolveStudentPreferredDays,
  resolveStudentResult,
  toConsideringIds
} from "@/features/students/lib/student-grouping"
import {
  buildRecontactBodyTemplate,
  estimateSmsBytes,
  isValidOptOutNumber,
  RECONTACT_SENDER_PHONE,
  isWithinRecontactHours,
  renderRecontactMessage,
  toFriendlyStudentName
} from "@/features/students/lib/recontact-message"
import { resolveRecontactBlock } from "@/features/students/lib/recontact-gate"
import { countTopPreferredDay, formatPreferredDays, resolvePreferredDays } from "@/features/students/lib/preferred-days"
import { STUDIO_STUDENT_RESULT_LABELS, STUDIO_STUDENT_RESULT_TONES } from "@/features/studio/lib/application-status-labels"
import { COMPANY_INFO } from "@/shared/config/company-info"
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

  // 홈 카드 = 학생 탭: 같은 묶음 · 같은 판정 · 같은 의향
  {
    const homeGroups = groupStudentApplications([
      app("h-ne", { childId: "c-ne", childName: "김미등", parentId: "p-ne", createdAt: "2026-09-10T00:00:00.000Z" }),
      // 같은 학생의 신청 둘(옛 미등록 + 새 고민 중) — 학생 하나로 센다
      app("h-old", { childId: "c-two", childName: "박두번", parentId: "p-two", createdAt: "2026-08-01T00:00:00.000Z" }),
      app("h-new", { childId: "c-two", childName: "박두번", parentId: "p-two", registrationStatus: "pending", createdAt: "2026-09-20T00:00:00.000Z" }),
      app("h-par", { childId: "c-par", childName: "이의향", parentId: "p-par", registrationStatus: "undecided", createdAt: "2026-09-15T00:00:00.000Z" }),
      app("h-und", { childId: "c-und", childName: "최결정", parentId: "p-und", registrationStatus: "undecided" }),
      app("h-enr", { childId: "c-enr", childName: "정등록", parentId: "p-enr", registrationStatus: "enrolled" }),
      app("h-cxl", { childId: "c-cxl", childName: "한불참", parentId: "p-cxl", registrationStatus: "pending", noShowAt: "2026-09-21T07:00:00.000Z" })
    ])
    const decisionIds = getStudentDecisionApplicationIds(homeGroups)
    check("의향은 체험 완료 · 취소 아님 · 등록 아님인 대표 신청만 읽는다(미등록 포함)",
      decisionIds.sort().join() === ["h-ne", "h-new", "h-par", "h-und"].sort().join(), decisionIds.join())
    const decisions = [
      { applicationId: "h-par", decision: "considering" as const, preferredDays: ["sat" as const] },
      { applicationId: "h-ne", decision: "declined" as const, preferredDays: ["sat" as const, "mon" as const] },
      { applicationId: "h-new", decision: "considering" as const, preferredDays: ["mon" as const] }
    ]
    const home = buildRecontactStudents(homeGroups, decisions as never)
    const tabRows = buildStudentListRows({ groups: homeGroups, consideringIds: toConsideringIds(decisions as never), consents: [], events: [], now: NOW })
      .filter((row) => isStudentInTab(row.result, "recontact"))
    check("홈 건수 = 학생 탭 건수(3명: 미등록 · 고민 중 · 학부모 의향 고민 중)", home.students.length === 3 && tabRows.length === 3, `${home.students.length} / ${tabRows.length}`)
    check("홈 아바타 학생 = 학생 탭 학생",
      home.students.map((item) => item.applicationId).sort().join() === tabRows.map((row) => row.applicationId).sort().join())
    check("홈 아바타는 최근 신청 먼저", home.students.map((item) => item.name).join() === "박두번,이의향,김미등", home.students.map((item) => item.name).join())
    check("요일 문장: 세 학생 중 월 2 · 토 2 → 같으면 월 먼저", home.topDay?.label === "월" && home.topDay.count === 2, JSON.stringify(home.topDay))
    check("다시 연락할 학생이 아니면 요일에 세지 않는다", buildRecontactStudents(homeGroups, [{ applicationId: "h-und", decision: "declined", preferredDays: ["sun"] }] as never).topDay === null)
  }

  // 원하는 요일(홈 · 분석 · 학생 상세 공용)
  {
    const pref = (...groups: Array<{ dayMode: "selected" | "any"; days: number[] }>) => ({
      version: 1, state: "specified",
      groups: groups.map((group) => ({ ...group, timeMode: "any", startTime: null, endTime: null }))
    })
    check("학부모 희망 요일이 상담 기록보다 먼저",
      JSON.stringify(resolvePreferredDays({ decisionDays: ["sun", "mon"], regularSchedulePreferences: [pref({ dayMode: "selected", days: [6] })] })) ===
      JSON.stringify({ days: ["mon", "sun"], source: "parent" }))
    check("학부모 요일이 없으면 상담 기록(요일 고른 묶음만, 무관은 빼고)",
      JSON.stringify(resolvePreferredDays({ decisionDays: [], regularSchedulePreferences: [pref({ dayMode: "any", days: [] }, { dayMode: "selected", days: [6, 2] })] })) ===
      JSON.stringify({ days: ["tue", "sat"], source: "consultation" }))
    check("상담 기록은 최근 신청부터 처음으로 요일이 있는 것",
      resolvePreferredDays({ regularSchedulePreferences: [null, { version: 1, state: "undecided", groups: [] }, pref({ dayMode: "selected", days: [3] })] })?.days.join() === "wed")
    check("둘 다 없으면 null", resolvePreferredDays({ decisionDays: null, regularSchedulePreferences: [null] }) === null)
    check("가장 많은 요일(같으면 월 먼저)", countTopPreferredDay([["sat"], ["mon", "sat"], ["mon"]])?.label === "월")
    check("표기 \"토요일 · 일요일\"", formatPreferredDays(["sat", "sun"]) === "토요일 · 일요일")
    const [group] = groupStudentApplications([app("pd1", { regularSchedulePreference: pref({ dayMode: "selected", days: [6] }) as never })])
    check("학생 단위: 대표 신청의 학부모 의향 먼저",
      resolveStudentPreferredDays(group, [{ applicationId: "pd1", decision: "considering", preferredDays: ["fri"] }] as never)?.days.join() === "fri" &&
      resolveStudentPreferredDays(group, [])?.days.join() === "sat")
    const homeWithConsultation = buildRecontactStudents(
      groupStudentApplications([
        app("hc1", { childId: "c1", childName: "가", parentId: "p1", regularSchedulePreference: pref({ dayMode: "selected", days: [6] }) as never }),
        app("hc2", { childId: "c2", childName: "나", parentId: "p2", regularSchedulePreference: pref({ dayMode: "selected", days: [6, 7] }) as never }),
        app("hc3", { childId: "c3", childName: "다", parentId: "p3", regularSchedulePreference: pref({ dayMode: "selected", days: [6] }) as never })
      ]),
      [{ applicationId: "hc3", decision: "considering", preferredDays: ["tue"] }] as never
    )
    check("홈 요일 문장: 학부모 요일 없는 학생은 상담 기록으로 센다(토 2 · 화 1)",
      homeWithConsultation.topDay?.label === "토" && homeWithConsultation.topDay.count === 2, JSON.stringify(homeWithConsultation.topDay))
  }

  const rows = buildStudentListRows({
    groups: groupStudentApplications([
      app("a1"),
      app("b1", { childId: "child-b", childName: "문서윤", parentId: "parent-2", parentPhone: "010-1111-2222", registrationStatus: "pending", registrationReasonIds: ["comparing_academies"] }),
      app("c1", { childId: "child-c", childName: "서지호", parentId: "parent-3", registrationReasonIds: [], unregisteredReason: "class_level_mismatch" }),
      app("x1", { parentId: null, childId: null, childName: "조하준", parentPhone: "010-9999-0000" }),
      // 신청서 번호는 있지만 학부모 계정 번호가 없다 → 보호자 휴대폰 번호가 필요해요
      app("d1", { childId: "child-d", childName: "한지안", parentId: "parent-4", parentPhone: "010-4444-5555" }),
      // 계정 번호도 없고 동의도 안 함 → 동의가 먼저
      app("e1", { childId: "child-e", childName: "윤이안", parentId: "parent-5" })
    ]),
    consideringIds: new Set(),
    consents: [
      { parentId: "parent-1", consented: true, consentedAt: "2026-09-18T13:05:00.000Z", withdrawnAt: null, phoneReady: true },
      { parentId: "parent-2", consented: false, consentedAt: "2026-09-01T00:00:00.000Z", withdrawnAt: "2026-09-20T00:00:00.000Z", phoneReady: true },
      { parentId: "parent-4", consented: true, consentedAt: "2026-09-18T13:05:00.000Z", withdrawnAt: null, phoneReady: false },
      { parentId: "parent-5", consented: false, consentedAt: null, withdrawnAt: "2026-09-20T00:00:00.000Z", phoneReady: false }
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
  check("동의했어도 계정 번호가 없으면 잠긴다(신청서 번호는 보지 않는다)", row("한지안").lock === "no_phone")
  check("잠금 이유는 동의가 먼저(동의 안 함 + 번호 없음 → 동의 안 함)", row("윤이안").lock === "no_consent")
  check("잠금 문구: 보호자 휴대폰 번호가 필요해요", STUDENT_LOCK_LABELS.no_phone.short === "보호자 휴대폰 번호가 필요해요")
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
    bodyTemplate: template,
    studentName: "정하람",
    trialLabel: "9월 로봇 코딩 체험",
    linkUrl: "https://firstsuup.com/classes/class-1",
    optOutNumber: "080-000-0000"
  })
  const lines = message.split("\n")
  check("첫 줄 (광고) [첫수업] 고객센터 번호", lines[0] === "(광고) [첫수업] 010-8384-0825", lines[0])
  check("고객센터 번호는 company-info 한 곳", RECONTACT_SENDER_PHONE === COMPANY_INFO.customerCenterPhone)
  check("둘째 줄 [학원명] + 인사 치환", lines[1] === "[중계 코딩랩] 하람이 보호자님, 지난 9월 로봇 코딩 체험에 와 주셔서 감사했어요.", lines[1])
  check("저장하는 템플릿에 학원명 머리가 없다(보낼 때 붙인다)", !template.includes("중계 코딩랩"))
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
  const ok = { entitled: true, localGuardAllowed: true, optOutNumber: "080-000-0000", now: at(12), selectedCount: 3, remaining: 182 }
  check("모두 갖추면 보낸다", resolveRecontactBlock(ok) === null)
  check("무료 플랜이 먼저", resolveRecontactBlock({ ...ok, entitled: false, optOutNumber: null, now: at(22) }) === "plan")
  check("개발 환경 로컬 가드", resolveRecontactBlock({ ...ok, localGuardAllowed: false }) === "local_guard")
  check("080 번호 없음", resolveRecontactBlock({ ...ok, optOutNumber: null }) === "opt_out_number")
  check("학원 대표번호는 막지 않는다(보내는 주체 = 첫수업)", resolveRecontactBlock({ ...ok, senderPhone: null } as typeof ok) === null)
  check("밤 9시~아침 8시", resolveRecontactBlock({ ...ok, now: at(21, 30) }) === "quiet_hours")
  check("고른 학생 없음", resolveRecontactBlock({ ...ok, selectedCount: 0 }) === "no_recipient")
  check("한 번에 50명", resolveRecontactBlock({ ...ok, selectedCount: 51, remaining: 200 }) === "too_many")
  check("남은 발송보다 많으면 한도", resolveRecontactBlock({ ...ok, selectedCount: 5, remaining: 4 }) === "limit")
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
