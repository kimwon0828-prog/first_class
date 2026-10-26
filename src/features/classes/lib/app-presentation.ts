// 학부모 앱(firstsuup-mobile src/data/catalog.ts · application.ts · ui/components/subject-icon.tsx)과 같은 표시 규칙.
// 화면 문구를 앱과 맞추기 위한 순수 함수만 둔다. 판정(신청 가능 여부 등)은 기존 웹 규칙을 그대로 쓴다.

const SEOUL = "Asia/Seoul"
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL, year: "numeric", month: "2-digit", day: "2-digit" })
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL, month: "long", day: "numeric", weekday: "short" })
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL, weekday: "short" })
const shortFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

/** "2026-10-20" (서울 날짜) */
export const seoulDateKey = (value: string) => dayFormatter.format(new Date(value))
/** "10월 20일 (화)" */
export const appDateLabel = (value: string) => dateFormatter.format(new Date(value))
const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: SEOUL, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
/** "오후 1:00". Node ICU 는 ko-KR 오전/오후를 "PM" 으로 내므로 24시 값으로 직접 만든다(서버 · 브라우저 같게). */
export const appTimeLabel = (value: string) => {
  const parts = Object.fromEntries(hourFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  const hour = Number(parts.hour)
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${parts.minute}`
}
/** "화" */
export const appWeekday = (value: string) => weekdayFormatter.format(new Date(value))
/**
 * 앱 endTimeSuffix 와 같다: " – 5:20"(같은 오전·오후), " – 오후 12:20"(오전·오후가 바뀜), " – 10월 17일 (토) 오전 1:00"(날짜가 바뀜).
 * 종료 시각이 없거나 시작보다 늦지 않으면 시작 시각만 — 길이를 짐작해 붙이지 않는다.
 */
export function appTimeRangeLabel(start: string, end?: string | null) {
  const from = Date.parse(start), to = end ? Date.parse(end) : NaN
  if (!end || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return appTimeLabel(start)
  if (seoulDateKey(end) !== seoulDateKey(start)) return `${appTimeLabel(start)} – ${appDateLabel(end)} ${appTimeLabel(end)}`
  const [startPeriod] = appTimeLabel(start).split(" "), [endPeriod, endClock] = appTimeLabel(end).split(" ")
  return `${appTimeLabel(start)} – ${startPeriod === endPeriod ? endClock : appTimeLabel(end)}`
}
/** 카드 시간 칩: "화 13:00" */
export const appShortSlot = (value: string) => {
  const parts = Object.fromEntries(shortFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.weekday} ${parts.hour}:${parts.minute}`
}
/** 소요 시간: "60분". 길이를 알 수 없으면 null(지어내지 않는다). */
export const appDurationLabel = (slot?: { startAt: string; endAt: string } | null) => {
  const minutes = slot ? Math.round((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000) : 0
  return minutes > 0 ? `${minutes}분` : null
}

export const PRICE_INQUIRY = "체험비는 학원에 문의"
export type AppPriceInfo = { label: string; free: boolean; known: boolean }
/**
 * 앱 trialPriceInfo 와 같다: 숫자가 아니면 무료로 바꾸지 않고, 0원은 학원이 확인한 경우만 무료다.
 * 확인하지 않은(false) 0원·값 없음은 "체험비는 학원에 문의". known:false 는 작은 회색 글자로 보인다.
 */
export function appPriceInfo(programType: string | null | undefined, trialPrice: number | null | undefined, confirmed?: boolean | null, kind = programType === "level_test" ? "레벨테스트" : "체험"): AppPriceInfo {
  const valid = typeof trialPrice === "number" && Number.isFinite(trialPrice) && trialPrice >= 0
  if (confirmed === false && (!valid || trialPrice === 0)) return { label: PRICE_INQUIRY, free: false, known: false }
  if (!valid) return { label: "가격 정보 확인 필요", free: false, known: false }
  return trialPrice === 0 ? { label: `무료 ${kind}`, free: true, known: true } : { label: `${kind} ${trialPrice.toLocaleString("ko-KR")}원`, free: false, known: true }
}

// 과목 이름 → 앱 과목 아이콘 코드. 첫수업 subject_categories / subjects 마스터의 이름과 같다.
const namesByCode: Record<string, string[]> = {
  korean_language: ["국어·논술", "국어", "논술", "독서", "문해력", "글쓰기", "독서토론"],
  math: ["수학", "교과수학", "사고력수학", "경시수학", "연산", "주산·암산"],
  english: ["영어", "파닉스", "영어회화", "영어독서", "내신영어", "수능영어", "공인영어"],
  science: ["과학", "과학실험", "탐구과학"],
  social_history: ["사회·역사", "사회", "역사", "한국사", "세계사", "역사논술"],
  coding_it_robotics: ["코딩·IT·로봇", "코딩", "IT", "로봇", "AI", "파이썬", "알고리즘", "웹·앱개발"],
  foreign_language: ["외국어", "중국어", "일본어", "스페인어", "프랑스어", "기타외국어"],
  music: ["음악", "피아노", "바이올린", "첼로", "플루트", "드럼", "성악", "작곡"],
  art_design: ["미술·디자인", "미술", "디자인", "드로잉", "회화", "만들기·공예", "디지털드로잉"],
  sports_dance: ["체육·무용", "체육", "무용", "태권도", "축구", "농구", "수영", "발레", "체조", "줄넘기"],
  creative_mind: ["창의·두뇌", "창의", "두뇌", "체스", "바둑", "보드게임", "창의융합", "교구활동"]
}
const normalize = (name: string) => name.replace(/\s+/g, "")
const codeByName = new Map(Object.entries(namesByCode).flatMap(([code, names]) => names.map(name => [normalize(name), code] as const)))
export const APP_SUBJECT_CODES = new Set([...Object.keys(namesByCode), "other"])

/** 모르는 이름은 other. "음악 · 피아노"처럼 오면 ' · '로 나눠 앞에서부터 찾는다. */
export function appSubjectCode(name?: string | null) {
  if (!name) return "other"
  return [name, ...name.split(/\s+·\s+/)].map(part => codeByName.get(normalize(part))).find(Boolean) ?? "other"
}
export const appSubjectCodeFromTags = (tags?: readonly string[] | null) =>
  tags?.map(appSubjectCode).find(code => code !== "other") ?? "other"
