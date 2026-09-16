// Parent Phase 6.4 — /record/[experienceId] 계약 검증.
//
// 소스와 순수 계약만 읽는다. DB · 네트워크 · server action 을 실행하지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const PAGE_PATH = "app/record/[experienceId]/page.tsx"
const CSS_PATH = "app/record/[experienceId]/page.module.css"
const DETAIL_QUERY_PATH = "src/features/record/queries/get-my-experience-detail.ts"
const REPORT_QUERY_PATH = "src/features/record/queries/get-my-experience-report.ts"
const DECISION_QUERY_PATH = "src/features/decisions/queries/get-my-current-parent-decision.ts"
const VIEW_PATH = "src/features/record/lib/experience-view.ts"
const TIMELINE_PATH = "src/features/record/ui/experience-timeline.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const page = codeOf(PAGE_PATH)
const css = stripComments(read(CSS_PATH))
const detailQuery = stripComments(read(DETAIL_QUERY_PATH))
const reportQuery = stripComments(read(REPORT_QUERY_PATH))
const decisionQuery = stripComments(read(DECISION_QUERY_PATH))
const view = stripComments(read(VIEW_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("\n[1] 접근과 identity")

check(
  "본인 경험 조회 뒤 notFound 로 닫는다",
  page.includes("getMyExperienceDetail(experienceId)") &&
    page.includes("if (!experience)") &&
    page.includes("notFound()")
)
check(
  "인증 returnTo 가 상세 route 다",
  page.includes("requireParentAccess({ returnTo: `/record/${experienceId}` })")
)
check("detail query 는 기존 parent-safe 목록을 재사용한다", detailQuery.includes("getMyApplications()"))
check("detail page 가 adapter · Supabase 를 직접 부르지 않는다", !page.includes("dataAdapter") && !page.includes("supabase"))

console.log("\n[2] 새 Parent IA")

check("완료 여부는 canonical completed 로만 가른다", page.includes('experience.status === "completed"'))
check(
  "완료 경험은 기록으로, 나머지는 신청 현황으로 돌아간다",
  page.includes('isCompletedExperience ? "/record" : "/my/applications"') &&
    page.includes('isCompletedExperience ? "기록" : "신청 현황"')
)
check("완료 경험 제목은 경험 정보다", page.includes('isCompletedExperience ? "경험 정보" : "신청 정보"'))
check("완료 경험은 처리 단계 라벨을 만들지 않는다", page.includes("!isCompletedExperience") && page.includes("stageLabel"))
check("처리 타임라인을 렌더하지 않는다", !page.includes("ExperienceTimeline") && !page.includes("진행 흐름"))
check("옛 상세 타임라인 컴포넌트를 제거했다", !existsSync(resolve(process.cwd(), TIMELINE_PATH)))
check(
  "사용처 없던 타임라인·기간 그룹 helper 를 제거했다",
  !view.includes("buildExperienceTimeline") &&
    !view.includes("groupExperiencesByPeriod") &&
    !view.includes("isActiveExperience")
)

console.log("\n[3] 경험 사실")

check("유형은 canonical helper 로 읽는다", page.includes("getExperienceTypeLabel(experience.classProgramType)"))
check("기록 날짜는 canonical helper 로 고른다", page.includes("resolveParentExperienceDate(experience)"))
check("날짜와 시각은 KST helper 로 읽는다", page.includes("getSeoulDateTimeParts"))
check("UTC 문자열 자르기를 하지 않는다", !page.includes('.slice(0, 10)') && !page.includes('.split("T")'))
check("자녀 · 날짜 · 장소를 사실 목록으로 그린다", page.includes("<dl") && page.includes("다녀온 날") && page.includes("장소"))
check("학원명과 장소가 없으면 줄을 만들지 않는다", page.includes("{experience.academyName ?") && page.includes("{address ?"))

console.log("\n[4] Report 계약")

check("완료 경험에서만 리포트를 조회한다", page.includes("isCompletedExperience ? await getMyExperienceReport(experienceId) : null"))
check("발행본이 있을 때만 CTA 를 그린다", page.includes("{hasPublishedReport ? (") && page.includes("`/record/${experience.id}/report`"))
check("조회 실패와 미발행을 구분한다", page.includes("reportLoadFailed") && !page.includes("리포트가 아직 없"))
check("리포트 query 는 published source 를 그대로 쓴다", reportQuery.includes("getPublishedExperienceReport(experienceId)"))
check("상세에서 report snapshot 을 재조립하지 않는다", !page.includes("trial_results") && !page.includes("trialResults"))

console.log("\n[5] ParentDecision · RegistrationResult 계약")

check(
  "결정 입력은 완료 + 기존 capability boolean 으로만 연다",
  page.includes("isCompletedExperience && experience.canCollectParentDecision")
)
check("부모의 현재 결정 query 를 그대로 쓴다", page.includes("getMyCurrentParentDecision(experienceId)"))
check("조회 실패를 빈 선택으로 접지 않는다", decisionQuery.includes('status: "error"') && page.includes("loadError="))
check("기존 ParentDecisionForm 을 그대로 쓴다", page.includes("<ParentDecisionForm"))
check(
  "RegistrationResult 원문·라벨·query 를 부모 상세로 가져오지 않는다",
  !page.includes("RegistrationResult") &&
    !page.includes("registrationStatus") &&
    !page.includes("getCurrentRegistrationResult")
)

console.log("\n[6] 행동과 표현")

check("수업 정보 링크는 부차 행동으로 남긴다", page.includes("`/classes/${experience.classId}`"))
check("취소는 기존 canCancel 과 기존 버튼을 쓴다", page.includes("experience.canCancel") && page.includes("<ExperienceCancelButton"))
check(
  "주요 터치 영역은 44px 이상이다",
  css.includes("min-height: 44px") && css.includes("min-height: 46px")
)
for (const term of ["별점", "점수", "순위", "랭킹", "적합도", "성향", "rating", "score"]) {
  check(`근거 없는 평가 표현 \"${term}\" 을 만들지 않는다`, !page.includes(term) && !css.includes(term))
}

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
