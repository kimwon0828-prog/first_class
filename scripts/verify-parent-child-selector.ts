// Home 자녀 선택(child selector) 계약 검증.
//
//   npx tsx scripts/verify-parent-child-selector.ts
//
// 여기서 고정하는 것.
//   A. 선택 상태는 /record 가 이미 쓰는 ?child= 하나다. 새 저장 방식을 만들지 않는다.
//   B. 남의 아이 id 를 주소에 넣어도 선택되지 않는다.
//   C. trigger 는 button 이고 dialog 를 연다. 터치 타깃 44px.
//   D. 아이가 0명이면 selector 를 띄우지 않는다.
//   E. "전체" 는 아이가 둘 이상일 때만 의미가 있다.
//   F. 고른 줄은 체크 하나로만 구분한다. 점수 · 추천 · 대표 자녀가 없다.
//   G. 아이를 고르면 아이와 연결된 자리만 좁힌다. 수업 탐색까지 걸러내지 않는다.
//   H. childId 없는 legacy 신청을 특정 아이 것이라고 말하지 않는다.
//   I. 선택을 저장하려고 write 를 만들지 않는다(새 action · DB 없음).
//   J. Bottom Sheet 는 기존 공용 컴포넌트를 쓴다(dialog · aria-modal · esc · scroll lock).
//   K. ChildProfile 을 통째로 client 로 내려보내지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  CHILD_QUERY_KEY,
  formatChildOptionLabel,
  formatChildTriggerLabel,
  resolveSelectedChildId,
  selectChildScopedItems,
  shouldOfferAllChildrenOption,
  toChildSelectorOptions,
  type ChildSelectorOption
} from "@/features/children/lib/child-selection"
import type { ChildProfile } from "@/shared/lib/db/adapter"

const LIB = "src/features/children/lib/child-selection.ts"
const UI = "src/features/children/ui/home-child-selector.tsx"
const UI_CSS = "src/features/children/ui/home-child-selector.module.css"
const HOME = "app/page.tsx"
const SUMMARY = "src/features/classes/queries/get-parent-home-summary.ts"
const SHEET = "src/shared/ui/bottom-sheet.tsx"
const RECORD = "app/record/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const lib = codeOf(LIB)
const ui = codeOf(UI)
const uiCss = read(UI_CSS)
const home = codeOf(HOME)
const summary = codeOf(SUMMARY)
const sheet = codeOf(SHEET)
const record = codeOf(RECORD)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const options: ChildSelectorOption[] = [
  { id: "c1", name: "김사랑", grade: "초6" },
  { id: "c2", name: "김민준", grade: "초3" }
]

console.log("[A] 저장 방식은 기존 ?child= 하나다")

check('A) query key 가 "child" 다', CHILD_QUERY_KEY === "child")
check("A) /record 도 같은 key 를 쓴다", record.includes("params.child"))
check("A) Home 이 그 계약을 읽는다", home.includes("CHILD_QUERY_KEY"))
/* 새 저장 방식을 만들지 않는다. */
for (const term of ["localStorage", "sessionStorage", "document.cookie", "cookies()"]) {
  check(`A) ${term} 을 쓰지 않는다`, !ui.includes(term) && !lib.includes(term) && !summary.includes(term))
}

console.log("\n[B] 남의 아이는 선택되지 않는다")

check("B) 내 아이면 선택된다", resolveSelectedChildId("c1", options) === "c1")
check("B) 목록에 없는 id 는 전체로 떨어진다", resolveSelectedChildId("someone-else", options) === null)
check("B) 빈 값은 전체다", resolveSelectedChildId("", options) === null && resolveSelectedChildId(null, options) === null)
check("B) 공백만 있는 값도 전체다", resolveSelectedChildId("   ", options) === null)

console.log("\n[C] trigger")

check("C) button 이다", ui.includes('type="button"'))
check("C) dialog 를 연다고 알린다", ui.includes('aria-haspopup="dialog"') && ui.includes("aria-expanded={open}"))
check("C) chevron 을 유지한다", ui.includes("ChevronIcon"))
const triggerRule = /\.trigger\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? ""
check(
  "C) 터치 타깃이 44px 이상이다",
  Number(/min-height:\s*(\d+)px/.exec(triggerRule)?.[1] ?? 0) >= 44,
  triggerRule.replace(/\s+/g, " ").trim()
)

console.log("\n[D][E] 0명 · 1명 · 2명")

check("D) 0명이면 라벨이 없다", formatChildTriggerLabel([], null) === null)
check("D) 라벨이 없으면 아무것도 그리지 않는다", ui.includes("if (!triggerLabel)") && ui.includes("return null"))
check("D) 호출부도 0명이면 띄우지 않는다", home.includes("parentHome.childOptions.length > 0"))
check("D) Home 에서 자녀 등록을 새로 권하지 않는다", !ui.includes("자녀 등록") && !ui.includes("아이를 등록"))
check("E) 1명이면 전체 선택지가 없다", !shouldOfferAllChildrenOption([options[0]]))
check("E) 2명이면 전체 선택지가 있다", shouldOfferAllChildrenOption(options))
check("E) 전체 선택지 문구", ui.includes("우리 아이 전체"))

console.log("\n[F] 라벨 · 선택 표시")

check("F) 전체 · 2명 라벨", formatChildTriggerLabel(options, null) === "우리 아이 2명")
check("F) 특정 아이 라벨", formatChildTriggerLabel(options, "c1") === "김사랑 · 초6")
check("F) 전체 · 1명 라벨", formatChildTriggerLabel([options[0]], null) === "초6 김사랑")
check("F) 학년이 비면 이름만 쓴다", formatChildOptionLabel({ id: "x", name: "김사랑", grade: "  " }) === "김사랑")
check("F) 선택은 체크 하나로만 구분한다", ui.includes("CheckIcon") && ui.includes('aria-label="선택됨"'))
check("F) aria-current 로도 알린다", ui.includes("aria-current"))
for (const term of ["추천", "점수", "대표 자녀", "우선", "맞춤", "인기", "AI"]) {
  check(`F) "${term}" 개념이 없다`, !ui.includes(term) && !lib.includes(term))
}
check("F) emoji 를 쓰지 않는다", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ui))

console.log("\n[G][H] 좁히는 범위")

const items = [
  { id: "a", childId: "c1" },
  { id: "b", childId: "c2" },
  { id: "legacy", childId: null }
]
check("G) 전체면 전부 남는다", selectChildScopedItems(items, null).length === 3)
check("G) 아이를 고르면 그 아이 것만", selectChildScopedItems(items, "c1").map((i) => i.id).join() === "a")
check("H) childId 없는 legacy 는 특정 아이 것이 아니다", !selectChildScopedItems(items, "c1").some((i) => i.id === "legacy"))
check("H) 전체에서는 legacy 도 보인다", selectChildScopedItems(items, null).some((i) => i.id === "legacy"))
/* 아이와 실제로 연결된 자리만 좁힌다. */
check(
  "G) 다가오는 일정과 확인할 것만 좁힌다",
  (summary.match(/selectChildScopedItems\(/g) ?? []).length === 2,
  String((summary.match(/selectChildScopedItems\(/g) ?? []).length)
)
check(
  "G) 수업 탐색 목록을 아이 기준으로 걸러내지 않는다",
  !home.includes("selectChildScopedItems") && !summary.includes("classes.filter")
)

console.log("\n[I] write 를 만들지 않는다")

check('I) "use server" 가 없다', !ui.includes('"use server"') && !lib.includes('"use server"'))
/* params.delete 는 주소 조작이지 DB 쓰기가 아니다. supabase 호출 형태만 본다. */
for (const term of ["supabase", ".insert(", ".update(", ".upsert(", ".from("]) {
  check(`I) ${term} 가 없다`, !ui.includes(term) && !lib.includes(term))
}
check("I) 새 adapter method 를 만들지 않았다", !summary.includes("dataAdapter."))
check("I) 기존 자녀 조회를 그대로 쓴다", summary.includes("getMyChildren"))
check("I) 주소만 바꾼다", ui.includes("router.replace"))

console.log("\n[J] Bottom Sheet 는 공용 컴포넌트다")

check("J) 새 modal 을 만들지 않았다", ui.includes('from "@/shared/ui/bottom-sheet"') && exists(SHEET))
check("J) dialog semantics", sheet.includes('role="dialog"') && sheet.includes('aria-modal="true"'))
check("J) backdrop 클릭으로 닫힌다", sheet.includes("onClick={(event)") && sheet.includes("onClose()"))
check("J) 닫기 버튼이 있다", sheet.includes('aria-label="닫기"'))
check("J) Escape 로 닫힌다", sheet.includes('event.key === "Escape"'))
check("J) 열려 있는 동안 배경이 스크롤되지 않는다", sheet.includes('document.body.style.overflow = "hidden"'))
check("J) 화면 전체를 덮지 않는다", read(SHEET).includes("max-height: 70vh"))
check("J) 상단 radius 가 크다", read(SHEET).includes("border-radius: var(--r-lg) var(--r-lg) 0 0"))
const optionRule = /\.option\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? ""
check(
  "J) 줄 높이가 56px 이상이다",
  Number(/min-height:\s*(\d+)px/.exec(optionRule)?.[1] ?? 0) >= 56
)

console.log("\n[K] client 로 내려보내는 값")

check("K) 최소 필드만 내려보낸다", lib.includes("export type ChildSelectorOption = {") && lib.includes("grade: string"))
for (const field of ["notes", "goalNote", "currentLevel", "interestSubjects", "schoolName", "parentId"]) {
  check(`K) "${field}" 를 내려보내지 않는다`, !lib.includes(field) && !ui.includes(field))
}
const sample = [
  {
    id: "c1",
    parentId: "p1",
    name: "김사랑",
    grade: "초6",
    schoolName: "노원초",
    notes: "내부 메모",
    currentLevel: "중급",
    interestSubjects: "영어",
    goalNote: "목표",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
] as ChildProfile[]
const projected = toChildSelectorOptions(sample)
check(
  "K) projection 결과에 id · name · grade 만 있다",
  Object.keys(projected[0]).sort().join() === "grade,id,name",
  Object.keys(projected[0]).join()
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
