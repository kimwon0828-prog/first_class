// 학생 = 신청을 자동으로 묶은 것(2차-3). 학생 표를 따로 저장하지 않는다.
//
// 묶는 규칙(AGENTS.md "학생 · 안내 문자"):
//   - 앱 · 웹 신청: child_id. child_id 가 없는 옛 신청은 같은 학부모 계정 + 같은 학생 이름으로 이어 붙인다.
//   - 엑셀 신청(학부모 계정 없음): 보호자 번호(숫자만) + 학생 이름. 앱 신청과는 합치지 않는다(합치기 기능은 범위 밖).
//   - 파기된 신청(이름이 지워진 것)은 학생으로 보이지 않는다.
// 학원은 children 을 읽지 못한다 — 화면 값은 모두 신청 당시 저장된 값이다.

import {
  STUDIO_APPLICATION_STATUS_LABELS,
  type StudioStudentResult
} from "@/features/studio/lib/application-status-labels"
import { resolveTrialDisplayStatus } from "@/features/studio/lib/trial-completion"
import { getNotEnrolledReasonLabel, PENDING_REASONS, resolveNotEnrolledReasonIds } from "@/features/registration/lib/registration-input"
import { LEARNER_GRADES, getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import type {
  ConsultationLogChannel,
  StudioApplicationSummary,
  StudioMarketingConsent,
  StudioStudentContactEvent
} from "@/shared/lib/db/adapter"

export type StudentGroup = {
  key: string
  /** 대표 신청: 가장 최근의 취소 · 불참 아닌 신청(없으면 가장 최근 신청). 결과 · 보내기 · 다음 연락은 이 신청이 기준이다. */
  representative: StudioApplicationSummary
  /** 최근 신청 먼저. */
  applications: StudioApplicationSummary[]
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** "9월 28일" (KST). */
export const formatStudentDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.month}월 ${parts.day}일` : ""
}

/** "10월 24일(토)" (KST). 날짜 키(YYYY-MM-DD)도 받는다. */
export const formatStudentDateWithWeekday = (value: string) => {
  const parts = getSeoulDateTimeParts(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+09:00` : value)
  return parts ? `${parts.month}월 ${parts.day}일(${WEEKDAYS[parts.weekday]})` : ""
}

const normalizeName = (value: string) => value.replace(/\s+/g, "").toLowerCase()
const phoneDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "")

const isCanceledOrNoShow = (item: StudioApplicationSummary) => item.status === "canceled" || Boolean(item.noShowAt)

/** 신청을 학생으로 묶는다. 입력 순서와 상관없이 같은 결과다. */
export const groupStudentApplications = (applications: StudioApplicationSummary[]): StudentGroup[] => {
  const visible = applications.filter((item) => !item.personalDataErased && item.childName.trim())

  // union-find: 같은 열쇠를 공유하는 신청끼리 한 학생이다.
  const parent = new Map<string, string>()
  const find = (node: string): string => {
    let root = node
    while (parent.get(root) !== root) root = parent.get(root) as string
    let cursor = node
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (left: string, right: string) => {
    if (!parent.has(left)) parent.set(left, left)
    if (!parent.has(right)) parent.set(right, right)
    const a = find(left)
    const b = find(right)
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
  }

  for (const item of visible) {
    const node = `a:${item.id}`
    if (!parent.has(node)) parent.set(node, node)
    const name = normalizeName(item.childName)
    if (item.childId) union(node, `c:${item.childId}`)
    if (item.parentId) {
      union(node, `p:${item.parentId}:${name}`)
    } else {
      const digits = phoneDigits(item.parentPhone)
      if (digits) union(node, `x:${digits}:${name}`)
    }
  }

  const byRoot = new Map<string, StudioApplicationSummary[]>()
  for (const item of visible) {
    const root = find(`a:${item.id}`)
    byRoot.set(root, [...(byRoot.get(root) ?? []), item])
  }

  return Array.from(byRoot.values()).map((items) => {
    const sorted = [...items].sort((left, right) =>
      left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1
    )
    const representative = sorted.find((item) => !isCanceledOrNoShow(item)) ?? sorted[0]
    // 열쇠는 대표 신청 id. 상세 주소도 신청 id 로 받고, 그 신청이 속한 학생을 다시 찾는다.
    return { key: representative.id, representative, applications: sorted }
  })
}

/** 신청 id 가 속한 학생. 없으면(다른 학원 · 파기) null. */
export const findStudentGroup = (groups: StudentGroup[], applicationId: string) =>
  groups.find((group) => group.applications.some((item) => item.id === applicationId)) ?? null

/**
 * 학생 결과. 대표 신청 하나로 정한다.
 * 고민 중 = 등록 결과 "고민 중" 또는 학부모가 남긴 지금 유효한 의향 "고민 중"(홈 다시 연락할 학생과 같은 판정).
 */
export const resolveStudentResult = (item: StudioApplicationSummary, consideringIds: ReadonlySet<string>): StudioStudentResult => {
  if (isCanceledOrNoShow(item)) return "canceled"
  if (item.status !== "completed") return "in_progress"
  if (item.registrationStatus === "enrolled") return "enrolled"
  if (item.registrationStatus === "not_enrolled") return "not_enrolled"
  if (item.registrationStatus === "pending" || consideringIds.has(item.id)) return "considering"
  return "undecided"
}

export type StudentTab = "recontact" | "enrolled" | "in_progress" | "all"

export const STUDENT_TABS: Array<{ value: StudentTab; label: string }> = [
  { value: "recontact", label: "다시 연락할 학생" },
  { value: "enrolled", label: "등록 학생" },
  { value: "in_progress", label: "진행 중" },
  { value: "all", label: "전체" }
]

export const isStudentInTab = (result: StudioStudentResult, tab: StudentTab) => {
  if (tab === "all") return true
  if (tab === "recontact") return result === "not_enrolled" || result === "considering"
  if (tab === "enrolled") return result === "enrolled"
  return result === "in_progress" || result === "undecided"
}

const pendingReasonLabel = (id: string): string | null => PENDING_REASONS.find(([value]) => value === id)?.[1] ?? null

const firstWithMore = (labels: string[]) =>
  labels.length === 0 ? null : labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}`

/** 결과 아래 한 줄. 사유 이름은 앱 목록 그대로다(registration-input). */
export const resolveStudentReason = (
  item: StudioApplicationSummary,
  result: StudioStudentResult,
  now: Date
): string | null => {
  if (result === "not_enrolled") {
    return firstWithMore(resolveNotEnrolledReasonIds(item).map(getNotEnrolledReasonLabel).filter((label): label is string => Boolean(label)))
  }
  if (result === "considering") {
    const labels = (item.registrationReasonIds ?? []).map(pendingReasonLabel).filter((label): label is string => Boolean(label))
    return firstWithMore(labels) ?? (item.registrationStatus === "pending" ? null : "학부모가 고민 중이에요")
  }
  if (result === "enrolled") {
    return item.enrolledAt ? `${formatStudentDate(item.enrolledAt)} 등록` : null
  }
  if (result === "undecided") return "결과 기록 전"
  if (result === "canceled") return item.noShowAt ? "불참" : "취소"
  return STUDIO_APPLICATION_STATUS_LABELS[resolveTrialDisplayStatus(item, now)]
}

/** "M월" — 체험한 달(확정 시각, 없으면 희망 시각). */
export const getTrialMonth = (item: StudioApplicationSummary) => {
  const parts = getSeoulDateTimeParts(item.confirmedSlotAt ?? item.requestedSlotAt)
  return parts ? parts.month : null
}

const trialNoun = (item: StudioApplicationSummary) => (item.classProgramType === "level_test" ? "레벨테스트" : "체험")

/** "9월 체험 · 관심 코딩" */
export const buildClassSubLine = (item: StudioApplicationSummary) => {
  const month = getTrialMonth(item)
  const interest = item.interestSubjects?.trim()
  return [month ? `${month}월 ${trialNoun(item)}` : trialNoun(item), interest ? `관심 ${interest}` : null].filter(Boolean).join(" · ")
}

const CONTACT_KIND_BY_CHANNEL: Partial<Record<ConsultationLogChannel, string>> = { PHONE: "전화", SMS: "문자" }

export type StudentLastContact = { at: string; kind: string }

/** 마지막 연락: 상담 기록(전화 · 문자 · 상담 메모) · 리포트 보냄 · 안내 문자 · 신청 중 가장 최근. */
export const resolveLastContact = (
  applications: StudioApplicationSummary[],
  events: StudioStudentContactEvent[]
): StudentLastContact | null => {
  const ids = new Set(applications.map((item) => item.id))
  const candidates: StudentLastContact[] = [
    ...applications.map((item) => ({ at: item.createdAt, kind: "신청" })),
    ...events
      .filter((event) => ids.has(event.applicationId))
      .filter((event) => event.kind !== "recontact" || event.status === "sent" || event.status === "dry_run")
      .map((event) => ({
        at: event.at,
        kind: event.kind === "report" ? "리포트" : event.kind === "recontact" ? "문자" : CONTACT_KIND_BY_CHANNEL[event.channel] ?? "상담 메모"
      }))
  ]
  return candidates.reduce<StudentLastContact | null>((latest, item) => (!latest || item.at > latest.at ? item : latest), null)
}

export type StudentLockReason = "no_account" | "no_consent" | "no_phone"

/** 안내를 보낼 수 있는가. 080 수신거부는 번호 해시가 서버에만 있어 보낼 때 서버가 다시 뺀다. */
export const resolveStudentLock = (
  item: StudioApplicationSummary,
  consentByParent: ReadonlyMap<string, StudioMarketingConsent>
): StudentLockReason | null => {
  if (!item.parentId) return "no_account"
  if (!phoneDigits(item.parentPhone)) return "no_phone"
  return consentByParent.get(item.parentId)?.consented ? null : "no_consent"
}

export const gradeOrder = (grade: string | null | undefined) => {
  const index = LEARNER_GRADES.findIndex((item) => item.value === grade)
  return index >= 0 ? index : null
}

export const gradeLabel = (grade: string | null | undefined) => (grade ? getChildGradeLabel(grade) ?? grade : "")

/** 목록 한 줄(클라이언트로 넘어간다 — 메모 · 전화번호 같은 값은 담지 않는다). */
export type StudentListRow = {
  key: string
  applicationId: string
  name: string
  gradeLabel: string
  gradeOrder: number | null
  parentName: string | null
  subjectCategory: string | null
  classTitle: string
  classSub: string
  /** 미리보기 · 문자 치환용: "9월 로봇 코딩 체험" */
  trialLabel: string
  result: StudioStudentResult
  reason: string | null
  lastContact: StudentLastContact | null
  lock: StudentLockReason | null
}

export const buildTrialLabel = (item: StudioApplicationSummary) => {
  const month = getTrialMonth(item)
  const title = item.classTitle?.trim() || trialNoun(item)
  return month ? `${month}월 ${title}` : title
}

export const buildStudentListRows = (input: {
  groups: StudentGroup[]
  consideringIds: ReadonlySet<string>
  consents: StudioMarketingConsent[]
  events: StudioStudentContactEvent[]
  now: Date
}): StudentListRow[] => {
  const consentByParent = new Map(input.consents.map((item) => [item.parentId, item]))
  const eventsByApplication = new Map<string, StudioStudentContactEvent[]>()
  for (const event of input.events) {
    eventsByApplication.set(event.applicationId, [...(eventsByApplication.get(event.applicationId) ?? []), event])
  }

  return input.groups
    .map((group) => {
      const item = group.representative
      const result = resolveStudentResult(item, input.consideringIds)
      const events = group.applications.flatMap((application) => eventsByApplication.get(application.id) ?? [])
      return {
        key: group.key,
        applicationId: item.id,
        name: item.childName,
        gradeLabel: gradeLabel(item.childGrade),
        gradeOrder: gradeOrder(item.childGrade),
        parentName: item.parentName,
        subjectCategory: item.classSubjectCategory ?? null,
        classTitle: item.classTitle?.trim() || "수업 정보 없음",
        classSub: buildClassSubLine(item),
        trialLabel: buildTrialLabel(item),
        result,
        reason: resolveStudentReason(item, result, input.now),
        lastContact: resolveLastContact(group.applications, events),
        lock: resolveStudentLock(item, consentByParent)
      }
    })
    .sort((left, right) => (right.lastContact?.at ?? "").localeCompare(left.lastContact?.at ?? ""))
}
