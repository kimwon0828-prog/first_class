// 수업 상세(/classes/[id]) 와 체험 신청(/classes/[id]/apply) 의 계약 검증.
//
//   npx tsx scripts/verify-parent-class-detail-apply.ts
//
// 여기서 고정하는 것.
//   1. 공개 조건(classes.is_active = true)을 우회하지 않는다.
//   2. 상세는 public safe projection 의 값만 그린다 — 상담 · CRM · 내부 평가 · 선생님 사적 정보 없음.
//   3. 학원명은 지점명까지, null 이면 안전하게.
//   4. 없는 일정을 있는 것처럼 암시하지 않는다. 0건이면 0건이라고 적는다.
//   5. 신청은 비로그인일 때 현재 apply URL 을 returnTo 로 보존한다.
//   6. 자녀는 실제 내 아이만. 서버가 다시 확인한다.
//   7. 신청 시점의 일정은 "희망" 이다. confirmedSlotAt 을 만들지 않는다.
//   8. 신청 성공은 /my/applications 로 간다(새 신청은 new 다).
//   9. 별점 · 점수 · 랭킹 · 마감 임박 같은 없는 정보를 만들지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  formatPublicSlotLabel,
  isBookablePublicSlot,
  selectBookablePublicSlots
} from "@/features/applications/lib/public-class-slots"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"

const DETAIL_PATH = "app/classes/[id]/page.tsx"
const APPLY_PATH = "app/classes/[id]/apply/page.tsx"
const APPLY_FORM_PATH = "src/features/applications/ui/apply-form.tsx"
const FORM_HOOK_PATH = "src/features/applications/ui/use-trial-application-form.ts"
const SHEET_PATH = "src/features/applications/ui/class-detail-application-sheet.tsx"
const SLOTS_LIB_PATH = "src/features/applications/lib/public-class-slots.ts"
const CREATE_PATH = "src/features/applications/actions/create-trial-application.ts"
const PROJECTION_PATH = "src/features/classes/queries/public-class-safe-projection.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const detail = codeOf(DETAIL_PATH)
const apply = codeOf(APPLY_PATH)
const applyForm = codeOf(APPLY_FORM_PATH)
const formHook = stripComments(read(FORM_HOOK_PATH))
const sheet = codeOf(SHEET_PATH)
const slotsLib = stripComments(read(SLOTS_LIB_PATH))
const create = stripComments(read(CREATE_PATH))
const projection = stripComments(read(PROJECTION_PATH))

let failures = 0
const check = (label: string, ok: boolean, detailText = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detailText ? `\n        ${detailText}` : ""}`)
}

const slot = (overrides: Partial<AvailableScheduleSlot> & { id: string }): AvailableScheduleSlot => ({
  source: "class_schedule",
  optionId: `opt-${overrides.id}`,
  classScheduleId: "sched-1",
  scheduleBlockId: null,
  scheduleType: "one_time",
  bookingStatus: "open",
  teacherId: null,
  classId: "class-1",
  label: "",
  startAt: "2026-09-18T06:00:00.000Z",
  endAt: "2026-09-18T07:00:00.000Z",
  capacity: 5,
  appliedCount: 0,
  remainingCount: 5,
  isClosed: false,
  ...overrides
})

const NOW = Date.parse("2026-09-16T00:00:00.000Z")

console.log("\n[1] 공개 조건을 우회하지 않는다")

const detailQuery = projection.slice(projection.indexOf("export const getPublicClassDetailWithSafeProjection"))
check(
  "A) 상세 질의가 is_active 를 건다",
  (detailQuery.match(/\.eq\("is_active", true\)/g)?.length ?? 0) >= 2,
  String(detailQuery.match(/\.eq\("is_active", true\)/g)?.length ?? 0)
)
check("상세는 public projection 만 쓴다", detail.includes("getPublicClassDetail(resolvedParams.id)"))
check("신청 화면도 같은 projection 을 쓴다", apply.includes("getPublicClassDetail(resolvedParams.id)"))
check(
  "공개 조건을 새로 넓히지 않았다",
  !projection.includes("approval_status") && !projection.includes("approved_at")
)

console.log("\n[2] 공개 정보만 그린다")

for (const term of ["consultation", "상담 내용", "내부 메모", "operationalMemo", "assessment", "conversion"]) {
  check(`상세에 "${term}" 이 없다`, !detail.includes(term))
}
check(
  "E) 선생님 사적 정보를 노출하지 않는다",
  !detail.includes("teacherName") && !detail.includes("teacherIntro") && !detail.includes("teacherDisplayName")
)
check(
  "projection 이 선생님 정보를 애초에 비운다",
  projection.includes("teacherDisplayName: null") &&
    projection.includes("teacherName: null") &&
    projection.includes("teacherIntro: null")
)
check(
  "C) 학원명은 지점명까지 붙이고 null 에 안전하다",
  detail.includes("[organization.name, organization.branchName].filter(Boolean).join(\" \")") &&
    apply.includes("classItem?.organization?.branchName?.trim() || null")
)
check(
  "대상 학년 · 과목은 master label 로 그린다",
  detail.includes("formatStoredTargetGrades(classItem?.targetAge)") &&
    detail.includes("formatClassSubjectDisplayLabel(classItem)")
)
check("raw code · UUID 를 그리지 않는다", !detail.includes("classItem.subjectId") && !detail.includes("subject_category_id"))

console.log("\n[3] 체험 가능 일정")

check("상세에 일정 섹션이 있다", detail.includes(">가장 빠른 체험 일정</h2>"))
check(
  "D) 0건이면 0건이라고 적는다",
  detail.includes("현재 예약 가능한 일정이 없어요.")
)
check(
  "D) 없는 일정을 암시하는 문구가 없다",
  !detail.includes("예약 가능 일정 확인") && !detail.includes("마감 임박") && !detail.includes("잔여")
)
check("조회 실패와 0건을 구분한다", detail.includes("{slotsError ? ("))
check(
  "판정은 신청 sheet 와 같은 함수다",
  detail.includes("selectEarliestDetailSlot(slots, Date.now()") &&
    read("src/features/classes/lib/class-detail-presentation.ts").includes("isBookablePublicSlot(slot, now)") &&
    slotsLib.includes("selectBookablePublicSlots(slots, now)") &&
    sheet.includes("isBookablePublicSlot(slot, Date.now())")
)
/* 주간 일정이 같은 문장을 반복하지 않는다. */
check("같은 말을 여러 번 하지 않는다", slotsLib.includes("seen.has(label)"))
check("KST helper 로 시각을 읽는다", slotsLib.includes("getSeoulDateTimeParts"))
check("UTC 문자열을 자르지 않는다", !slotsLib.includes(".slice(0, 10)") && !slotsLib.includes('.split("T")'))

// 숨김 · 마감 · 잔여 0 · 지난 슬롯은 고를 수 없다.
check("열린 슬롯은 고를 수 있다", isBookablePublicSlot(slot({ id: "open" }), NOW))
check("hidden 은 제외", !isBookablePublicSlot(slot({ id: "h", bookingStatus: "hidden" }), NOW))
check("마감은 제외", !isBookablePublicSlot(slot({ id: "c", isClosed: true }), NOW))
check("잔여 0 은 제외", !isBookablePublicSlot(slot({ id: "r", remainingCount: 0 }), NOW))
check(
  "지난 일정은 제외",
  !isBookablePublicSlot(slot({ id: "p", startAt: "2026-09-10T06:00:00.000Z" }), NOW)
)
const picked = selectBookablePublicSlots(
  [
    slot({ id: "late", startAt: "2026-09-20T06:00:00.000Z" }),
    slot({ id: "soon", startAt: "2026-09-18T06:00:00.000Z" }),
    slot({ id: "closed", isClosed: true })
  ],
  NOW
).map((item) => item.id)
check("빠른 순으로 고른다", picked.join(",") === "soon,late", picked.join(","))

// 2026-09-18T06:00Z = 한국시간 9/18(금) 15:00
check(
  "one_time 은 날짜 + 시간",
  formatPublicSlotLabel(slot({ id: "o" })) === "9월 18일 (금) 오후 3:00",
  String(formatPublicSlotLabel(slot({ id: "o" })))
)
check(
  "weekly 는 요일 + 시간",
  formatPublicSlotLabel(slot({ id: "w", scheduleType: "weekly" })) === "매주 금요일 오후 3:00",
  String(formatPublicSlotLabel(slot({ id: "w", scheduleType: "weekly" })))
)
check("깨진 시각은 라벨이 없다", formatPublicSlotLabel(slot({ id: "b", startAt: "어제" })) === null)

console.log("\n[4] 신청 화면")

check(
  "F) 비로그인 returnTo 가 현재 apply URL 이다",
  apply.includes('const returnTo = `/classes/${resolvedParams.id}/apply`') &&
    apply.includes("requireSession(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)")
)
check("기본 Home fallback 으로 덮어쓰지 않는다", !apply.includes('returnTo ?? "/"'))
check(
  "요약 카드가 수업 · 학원 · 유형 · 가격을 말한다",
  apply.includes("{classItem.title}") &&
    apply.includes("{cardSubtitle}") &&
    apply.includes("resolveProgramTypeLabel(classItem.programType)") &&
    apply.includes("formatPrice(classItem.trialPrice)")
)
check("오류에서 방금 보던 수업으로 돌아간다", apply.includes("`/classes/${resolvedParams.id}`"))
check("학원 계정은 신청할 수 없다", apply.includes('profile.role === "academy" || profile.role === "admin"'))

console.log("\n[5] 자녀 · 일정 선택 계약")

check("G) 실제 children 목록만 쓴다", apply.includes("getMyChildren()"))
check(
  "G) 서버가 내 아이인지 다시 확인한다",
  create.includes("myChildren.find((child) => child.id === validated.childId)")
)
check(
  "일정은 slot optionId 로 고른다",
  create.includes('formData.get("selectedScheduleOptionId")')
)
/*
 * 신청은 "희망" 이다.
 *
 * ⚠️ 읽어서 알림에 싣는 것(createdApplication.confirmedSlotAt)은 상관없다 —
 *    새 신청에서는 null 이다. 금지하는 것은 insert 입력에 확정 시각을 넣는 것이다.
 */
const createInput = create.slice(
  create.indexOf("dataAdapter.createTrialApplication({"),
  create.indexOf("const supabase = await getSupabaseServerClient()")
)
check(
  "H) 신청 시점에 확정 시각을 만들지 않는다",
  !createInput.includes("confirmedSlotAt") && !createInput.includes("confirmed_slot_at"),
  createInput.replace(/\s+/g, " ").slice(0, 160)
)
check(
  "H) 희망 일정은 slot 선택으로만 들어간다",
  createInput.includes("selectedScheduleOptionId: validated.selectedScheduleOptionId")
)
check(
  "H) 화면도 '확정' 이라고 말하지 않는다",
  !applyForm.includes("예약 확정") && !applyForm.includes("예약이 확정") && !detail.includes("예약 확정")
)
check(
  "제출 전 필수 동의 · 학년을 확인한다",
  formHook.includes("requiredAgreementsChecked") && formHook.includes("isGradeEligible")
)

console.log("\n[6] 신청 완료")

check(
  "I) 성공은 /my/applications 로 간다",
  create.includes('redirectTo: "/my/applications"'),
  create.includes('redirectTo: "/record"') ? "아직 /record 로 보낸다" : ""
)
check("접수라고 말한다", create.includes("신청이 접수되었습니다."))
check("확정이라고 말하지 않는다", !create.includes("예약이 확정"))
check(
  "CTA 는 신청이라고 적는다",
  applyForm.includes('"체험 신청하기"') && !applyForm.includes("신청 완료하기")
)
check("서버 오류 문구가 있다", create.includes("신청에 실패했습니다. 잠시 후 다시 시도해 주세요."))

console.log("\n[7] 없는 정보를 만들지 않는다")

const FORBIDDEN = [
  "별점",
  "리뷰",
  "인기",
  "매칭률",
  "추천 점수",
  "BEST",
  "마감 임박",
  "명이 보고",
  "rating",
  "reviewCount"
]
for (const term of FORBIDDEN) {
  check(`J) "${term}" 을 만들지 않는다`, !detail.includes(term) && !apply.includes(term))
}
check(
  "emoji 를 아이콘으로 쓰지 않는다",
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(detail + apply)
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
