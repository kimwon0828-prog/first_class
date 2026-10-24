import "server-only"

import { cache } from "react"

import { listStudioCurrentParentDecisions } from "@/features/decisions/queries/list-studio-current-parent-decisions"
import {
  STUDIO_STUDENT_RESULT_LABELS,
  type StudioStudentResult
} from "@/features/studio/lib/application-status-labels"
import {
  formatRegularSchedulePreference,
  parseRegularSchedulePreference
} from "@/features/studio/lib/regular-schedule-preference"
import { toSeoulDateKey } from "@/features/studio/lib/studio-schedule-month"
import {
  buildRecontactStudents,
  buildStudentListRows,
  buildTrialLabel,
  findStudentGroup,
  formatStudentDate,
  formatStudentDateWithWeekday,
  getStudentDecisionApplicationIds,
  gradeLabel,
  groupStudentApplications,
  resolveStudentLock,
  resolveStudentReason,
  resolveStudentResult,
  toConsideringIds,
  type StudentGroup,
  type StudentListRow,
  type StudentLockReason
} from "@/features/students/lib/student-grouping"
import { RECONTACT_TEMPLATES } from "@/features/students/lib/recontact-message"
import { dataAdapter } from "@/shared/lib/db"
import type { ConsultationLogChannel, RecontactRecipientStatus, StudioApplicationSummary, StudioMarketingConsent } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import type { QueryResult } from "@/shared/queries"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** "9월 28일(월) 14:30" — 날짜 표기 규칙(요일을 꼭 함께). */
export const formatStudentDateTime = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) return ""
  return `${parts.month}월 ${parts.day}일(${WEEKDAYS[parts.weekday]}) ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
}

/** 같은 요청 안에서 목록 · 상세가 같은 조회를 쓴다. 의향 조회가 실패하면 등록 결과만으로 판정한다. */
const loadStudentGroups = cache(async (organizationId: string) => {
  const applications = await dataAdapter.listStudioApplications(organizationId)
  const groups = groupStudentApplications(applications)
  const decisions = await listStudioCurrentParentDecisions(getStudentDecisionApplicationIds(groups))
  return { groups, consideringIds: toConsideringIds(decisions.data) }
})

/**
 * 홈 "다시 연락할 학생" 카드. 학생 메뉴 "다시 연락할 학생" 탭과 같은 묶음 · 같은 판정(buildRecontactStudents)이다.
 * 신청 목록은 홈이 이미 읽은 것을 받는다(같은 조회를 두 번 하지 않게).
 */
export const getStudioRecontactStudents = async (applications: StudioApplicationSummary[]) => {
  const groups = groupStudentApplications(applications)
  const decisions = await listStudioCurrentParentDecisions(getStudentDecisionApplicationIds(groups))
  return buildRecontactStudents(groups, decisions.data)
}

const parentIdsOf = (groups: StudentGroup[]) =>
  Array.from(new Set(groups.map((group) => group.representative.parentId).filter((id): id is string => Boolean(id))))

export type StudioStudentsListData = {
  rows: StudentListRow[]
  /** 동의한 보호자 수(보낼 수 있는 학생 판단의 바탕). */
  consentedCount: number
}

export const getStudioStudentsList = async (organizationId: string, now: Date): Promise<QueryResult<StudioStudentsListData>> => {
  try {
    const { groups, consideringIds } = await loadStudentGroups(organizationId)
    const [consents, activity] = await Promise.all([
      dataAdapter.listStudioMarketingConsents(organizationId, parentIdsOf(groups)),
      dataAdapter.listStudioStudentActivity(organizationId, groups.flatMap((group) => group.applications.map((item) => item.id)))
    ])
    const rows = buildStudentListRows({ groups, consideringIds, consents, events: activity.events, now })
    return { data: { rows, consentedCount: consents.filter((item) => item.consented).length }, error: null }
  } catch {
    return { data: { rows: [], consentedCount: 0 }, error: "학생 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
}

// ── 상세 ─────────────────────────────────────────────────────────

export type StudentExperienceCard = {
  applicationId: string
  classTitle: string
  subjectCategory: string | null
  whenLabel: string
  teacherName: string | null
  publicSummary: string | null
  result: StudioStudentResult
  resultLabel: string
  reasonLine: string | null
  recordedLabel: string | null
  reportSent: boolean
}

export type StudentTimelineItem = { key: string; at: string; title: string; detail: string }

export type StudioStudentDetail = {
  applicationId: string
  name: string
  gradeLabel: string
  school: string | null
  subjectCategory: string | null
  result: StudioStudentResult
  parentName: string | null
  parentPhone: string | null
  consent: StudioMarketingConsent | null
  lock: StudentLockReason | null
  trialLabel: string
  experiences: StudentExperienceCard[]
  timeline: StudentTimelineItem[]
  nextContact: { applicationId: string; dateKey: string; dateLabel: string; note: string } | null
  info: { interestSubjects: string | null; currentLevel: string | null; regularSchedule: string | null }
}

/** 연락 기록의 안내 문자 상태. opted_out 은 080 거부로 NCP 가 걸러낸 것(매일 결과 확인 뒤 바뀐다). */
const RECONTACT_STATUS_TEXT: Record<RecontactRecipientStatus, string> = {
  queued: "보내는 중",
  sent: "보냄",
  failed: "보내지 못했어요",
  dry_run: "시험 발송(실제로 가지 않음)",
  opted_out: "수신거부로 발송 안 됨"
}

const CHANNEL_TITLES: Record<ConsultationLogChannel, string> = {
  PHONE: "전화",
  SMS: "문자",
  KAKAO: "카카오톡",
  VISIT: "방문 상담",
  OTHER: "상담 메모"
}

const firstText = (items: StudioApplicationSummary[], pick: (item: StudioApplicationSummary) => string | null | undefined) =>
  items.map((item) => pick(item)?.trim()).find((value): value is string => Boolean(value)) ?? null

const resolveRegularSchedule = (items: StudioApplicationSummary[]) => {
  for (const item of items) {
    const parsed = parseRegularSchedulePreference(item.regularSchedulePreference)
    if (parsed.status === "valid") return formatRegularSchedulePreference(parsed.value)
  }
  return firstText(items, (item) => item.preferredRegularSchedule)
}

/** 다음 연락: 학생의 신청 중 다음 연락이 적힌 가장 최근 것. 저장은 대표 신청에 한다. */
const resolveNextContact = (items: StudioApplicationSummary[]) => {
  const item = items
    .filter((row) => row.nextContactAt && row.followUpNote?.trim())
    .sort((left, right) => (right.nextContactAt as string).localeCompare(left.nextContactAt as string))[0]
  const dateKey = item?.nextContactAt ? toSeoulDateKey(item.nextContactAt) : null
  return item && dateKey
    ? { applicationId: item.id, dateKey, dateLabel: formatStudentDateWithWeekday(dateKey), note: item.followUpNote!.trim() }
    : null
}

export const getStudioStudentDetail = async (
  organizationId: string,
  applicationId: string,
  now: Date
): Promise<QueryResult<StudioStudentDetail | null>> => {
  try {
    const { groups, consideringIds } = await loadStudentGroups(organizationId)
    const group = findStudentGroup(groups, applicationId)
    if (!group) return { data: null, error: null }

    const item = group.representative
    const ids = group.applications.map((row) => row.id)
    const [consents, activity] = await Promise.all([
      dataAdapter.listStudioMarketingConsents(organizationId, item.parentId ? [item.parentId] : []),
      dataAdapter.listStudioStudentActivity(organizationId, ids, { includeNotes: true, includeTrialSummaries: true })
    ])
    const consentByParent = new Map(consents.map((row) => [row.parentId, row]))
    const summaryById = new Map(activity.trialSummaries.map((row) => [row.applicationId, row.publicSummary]))
    const reportIds = new Set(activity.events.filter((event) => event.kind === "report").map((event) => event.applicationId))
    const titleById = new Map(group.applications.map((row) => [row.id, row.classTitle?.trim() || "수업 정보 없음"]))

    const experiences = group.applications.map<StudentExperienceCard>((row) => {
      const result = resolveStudentResult(row, consideringIds)
      const reason = resolveStudentReason(row, result, now)
      const resolvedAt = result === "enrolled" ? row.enrolledAt : result === "not_enrolled" ? row.lostAt ?? null : null
      return {
        applicationId: row.id,
        classTitle: titleById.get(row.id) as string,
        subjectCategory: row.classSubjectCategory ?? null,
        whenLabel: formatStudentDateTime(row.confirmedSlotAt ?? row.requestedSlotAt),
        teacherName: row.assignedTeacherName,
        publicSummary: summaryById.get(row.id) ?? null,
        result,
        resultLabel: STUDIO_STUDENT_RESULT_LABELS[result],
        reasonLine: [reason, row.registrationNote?.trim() || null].filter(Boolean).join(" · ") || null,
        recordedLabel: resolvedAt ? `${formatStudentDate(resolvedAt)} 기록` : null,
        reportSent: reportIds.has(row.id)
      }
    })

    const templateLabel = (kind: string | null) => RECONTACT_TEMPLATES.find((template) => template.kind === kind)?.label ?? "안내"
    const timeline: StudentTimelineItem[] = [
      ...activity.events.map<StudentTimelineItem>((event, index) => {
        const at = formatStudentDateTime(event.at)
        if (event.kind === "report") {
          return { key: `r${index}`, at: event.at, title: "리포트 보냄", detail: `${titleById.get(event.applicationId) ?? ""} · ${at}` }
        }
        if (event.kind === "recontact") {
          const state = RECONTACT_STATUS_TEXT[event.status]
          return { key: `m${index}`, at: event.at, title: `안내 문자 · ${templateLabel(event.templateKind)}`, detail: `${state} · ${at}` }
        }
        return {
          key: `c${index}`,
          at: event.at,
          title: [CHANNEL_TITLES[event.channel] ?? "상담 메모", event.authorName].filter(Boolean).join(" · "),
          detail: event.note ? `“${event.note}” · ${at}` : at
        }
      }),
      ...group.applications.map<StudentTimelineItem>((row) => ({
        key: `a${row.id}`,
        at: row.createdAt,
        title: `${row.classProgramType === "level_test" ? "레벨테스트" : "체험"} 신청 · ${row.importBatchId ? "엑셀 가져오기" : row.parentId ? "학부모" : "학원 등록"}`,
        detail: `${titleById.get(row.id)} · ${formatStudentDateTime(row.createdAt)}`
      }))
    ].sort((left, right) => right.at.localeCompare(left.at))

    return {
      data: {
        applicationId: item.id,
        name: item.childName,
        gradeLabel: gradeLabel(item.childGrade),
        school: firstText(group.applications, (row) => row.childSchool),
        subjectCategory: item.classSubjectCategory ?? null,
        result: resolveStudentResult(item, consideringIds),
        parentName: item.parentName,
        parentPhone: item.parentPhone,
        consent: item.parentId ? consentByParent.get(item.parentId) ?? null : null,
        lock: resolveStudentLock(item, consentByParent),
        trialLabel: buildTrialLabel(item),
        experiences,
        timeline,
        nextContact: resolveNextContact(group.applications),
        info: {
          interestSubjects: firstText(group.applications, (row) => row.interestSubjects),
          currentLevel: firstText(group.applications, (row) => row.currentLevel),
          regularSchedule: resolveRegularSchedule(group.applications)
        }
      },
      error: null
    }
  } catch {
    return { data: null, error: "학생 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
}

/** 다음 연락 저장 · 안내 보내기가 쓰는 서버 확인: 이 신청이 이 학원 학생의 것인가, 그 학생의 신청들은 무엇인가. */
export const resolveStudioStudentGroup = async (organizationId: string, applicationId: string) => {
  const { groups } = await loadStudentGroups(organizationId)
  return findStudentGroup(groups, applicationId)
}
