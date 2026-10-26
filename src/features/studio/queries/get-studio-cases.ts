import "server-only"
import { CASE_PAGE_SIZE, getCaseFilterPredicate, sanitizeCaseSearchQuery, type CaseFilterKey, type CaseViewKey } from "@/features/studio/lib/case-filters"
import { CASES_ACTION_SECTIONS, deriveCasesWorkflow, type CasesListItem } from "@/features/studio/lib/cases-workflow"
import { getReportSubjectCategory } from "@/features/studio/lib/trial-result-options"
import { getCasesResultRecord, orderStudioCases, type CasesOrderRow, type CasesOrderLog, type CasesRegistrationClock, type CasesResultRecord } from "@/features/studio/lib/cases-order"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { ApplicationRegistrationStatus, ApplicationStatus } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

// Cases has an existing direct query boundary; no adapter or mutation contract changes.
// Trial status owns membership; record/report existence only drives row guidance.
// report means any sent snapshot: withdrawal cannot reopen publication under Phase 1.
export const CASE_SELECT_FIELDS =
  "id, child_name, child_grade, parent_name, parent_phone, assigned_teacher_id, " +
  "requested_slot_at, confirmed_slot_at, status, registration_status, registration_reason_ids, created_at, completed_at, enrolled_at, canceled_at, no_show_at, lost_at, next_contact_at, " +
  "class_schedules(start_time,end_time), " +
  "confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at,end_at), " +
  "record:trial_results(application_id,created_at),report:experience_reports(application_id,published_at), " +
  "classes!inner(id,title,subject,organization_id,report_category:subject_categories(code),report_subject:subjects(code,subject_categories(code)))"
type Embedded<T> = T | T[] | null
const single = <T,>(value: Embedded<T>): T | null => Array.isArray(value) ? value.length === 1 ? value[0] : null : value
const many = <T,>(value: Embedded<T>): T[] => Array.isArray(value) ? value : value ? [value] : []
type CaseRow = CasesOrderRow & {
  id: string; child_name: string | null; child_grade: string | null; parent_name: string | null; parent_phone: string | null
  assigned_teacher_id: string | null; requested_slot_at: string; confirmed_slot_at: string | null
  status: ApplicationStatus; registration_status: ApplicationRegistrationStatus; registration_reason_ids: string[] | null
  created_at: string; completed_at: string | null; enrolled_at: string | null; canceled_at: string | null; no_show_at: string | null; lost_at: string | null
  classes: Embedded<{ title: string | null; subject: string | null; report_category?: Embedded<{ code: string | null }>; report_subject?: Embedded<{ code: string | null; subject_categories?: Embedded<{ code: string | null }> }> }>
  class_schedules: Embedded<{ start_time: string | null; end_time: string | null }>
  confirmed_block: Embedded<{ start_at: string; end_at: string }>
  record: Embedded<{ application_id: string; created_at: string }>
  report: Embedded<{ application_id: string; published_at: string }>
}
export type GetStudioCasesOptions = { view: CaseViewKey; filter: CaseFilterKey; query?: string | null; page?: number }
export type StudioCasesQueryData = { items: CasesListItem[]; page: number; pageSize: number; totalCount: number; totalPages: number }
const empty = (page: number): StudioCasesQueryData => ({ items: [], page, pageSize: CASE_PAGE_SIZE, totalCount: 0, totalPages: 0 })

// Read the complete filtered cohort before a computed cross-field/log ordering.
// Advance by actual rows received: PostgREST max_rows can be smaller than our range.
async function readAllRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown; count: number | null }>): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  do {
    const result = await query(rows.length, rows.length + 499)
    if (result.error) throw result.error
    if (result.count === null || !Array.isArray(result.data)) throw new Error("incomplete_cases_count")
    total ??= result.count
    if (!result.data.length && rows.length < total) throw new Error("incomplete_cases_rows")
    rows.push(...result.data as T[])
  } while (rows.length < total)
  return rows
}
type CasesClient = Awaited<ReturnType<typeof getSupabaseServerClient>>
// The list and the filter counts share this one builder, so a chip count and its list always use the same conditions.
async function createCaseQueryBuilder(supabase: CasesClient, organizationId: string, options: Pick<GetStudioCasesOptions, "view" | "filter" | "query">) {
  const search = sanitizeCaseSearchQuery(options.query)
  let classIds: string[] = []
  if (search) {
    const matches = await readAllRows<{ id: string }>((from, to) => supabase.from("classes").select("id", { count: "exact" })
      .eq("organization_id", organizationId).ilike("title", `%${search}%`).order("id").range(from, to))
    classIds = matches.map(row => row.id)
  }
  return (head = false) => {
    let query = supabase.from("studio_trial_applications").select(CASE_SELECT_FIELDS, { count: "exact", head })
      .eq("classes.organization_id", organizationId)
      .or(getCaseFilterPredicate(options.view, options.filter).orExpression)
    if (search) {
      const terms = [`child_name.ilike.%${search}%`, `parent_name.ilike.%${search}%`]
      if (classIds.length) terms.push(`class_id.in.(${classIds.join(",")})`)
      query = query.or(terms.join(","))
    }
    return query.order("id", { ascending: true })
  }
}
/** 필터 칩 건수. 목록과 같은 조건(조직·필터·검색어)으로 행 없이 개수만 센다. 읽기 전용. */
export async function countStudioCases(organizationId: string, options: Pick<GetStudioCasesOptions, "view" | "filter" | "query">): Promise<number | null> {
  try {
    const supabase = await getSupabaseServerClient()
    const { count, error } = await (await createCaseQueryBuilder(supabase, organizationId, options))(true)
    return error || count === null ? null : count
  } catch {
    return null
  }
}
export async function getStudioCases(organizationId: string, options: GetStudioCasesOptions): Promise<QueryResult<StudioCasesQueryData>> {
  const page = Math.max(1, options.page ?? 1)
  try {
    const supabase = await getSupabaseServerClient()
    const buildQuery = await createCaseQueryBuilder(supabase, organizationId, options)
    const cohort = await readAllRows<CaseRow>((from, to) => buildQuery().range(from, to))
    const resultRecords = new Map<string, CasesResultRecord>()
    if (options.view === "closed") {
      // Batches are scoped to IDs already read through the organization/RLS boundary.
      // Read only result/status history; never infer result dates from contact activity.
      for (let offset = 0; offset < cohort.length; offset += 100) {
        const batch = cohort.slice(offset, offset + 100), batchIds = batch.map(row => row.id)
        const [logs, results] = await Promise.all([
          readAllRows<CasesOrderLog>((from, to) => supabase.from("application_logs")
            .select("id,application_id,from_status,to_status,note,created_at", { count: "exact" }).in("application_id", batchIds)
            .or("note.like.*registration_result_saved*,to_status.eq.canceled").order("id").range(from, to)),
          readAllRows<CasesRegistrationClock>((from, to) => supabase.from("registration_results")
            .select("id,application_id,result,resolved_at,superseded_at", { count: "exact" }).in("application_id", batchIds)
            .is("superseded_at", null).order("id").range(from, to))
        ])
        for (const row of batch) resultRecords.set(row.id, getCasesResultRecord(row, logs, results))
      }
    }
    const now = new Date()
    const ordered = orderStudioCases(cohort, options.view, options.filter, resultRecords, now)
    const totalCount = ordered.length
    const rows = ordered.slice((page - 1) * CASE_PAGE_SIZE, page * CASE_PAGE_SIZE)
    const result: StudioCasesQueryData = { ...empty(page), totalCount, totalPages: Math.ceil(totalCount / CASE_PAGE_SIZE) }
    if (!rows.length) return { data: result, error: null }
    const ids = rows.map(row => row.id), teacherIds = [...new Set(rows.flatMap(row => row.assigned_teacher_id ? [row.assigned_teacher_id] : []))]
    // Two page-wide batches, independent of row count. No private consultation text needed.
    const [teachers, contacts] = await Promise.all([
      teacherIds.length ? supabase.from("teachers").select("id,display_name").in("id", teacherIds) : null,
      supabase.from("consultation_logs").select("application_id,occurred_at").in("application_id", ids)
        .in("activity_type", ["CONSULTATION", "LEGACY_IMPORT"]).order("occurred_at", { ascending: false })
    ])
    if (teachers?.error || contacts.error) throw teachers?.error ?? contacts.error
    const names = new Map((teachers?.data ?? []).map(row => [row.id, row.display_name]))
    const latestContacts = new Map<string, string>()
    for (const row of contacts.data ?? []) if (!latestContacts.has(row.application_id)) latestContacts.set(row.application_id, row.occurred_at)
    result.items = rows.map(row => {
      const klass = single(row.classes), schedule = single(row.class_schedules), block = single(row.confirmed_block)
      const records = many(row.record), reports = many(row.report)
      const workflow = deriveCasesWorkflow({ status: row.status, registrationStatus: row.registration_status, canceledAt: row.canceled_at, noShowAt: row.no_show_at,
        recordFinalized: records.length > 0, reportSent: reports.length > 0,
        confirmedBlockStartAt: block?.start_at ?? null, confirmedBlockEndAt: block?.end_at ?? null,
        confirmedSlotAt: row.confirmed_slot_at, scheduleStartTime: schedule?.start_time ?? null, scheduleEndTime: schedule?.end_time ?? null }, now)
      if (row.child_name === null) workflow.action = "detail"
      const candidates = [
        { at: row.created_at, label: "신청 접수" }, { at: row.completed_at, label: "체험 완료" },
        ...records.map(record => ({ at: record.created_at, label: "체험 기록 완료" })),
        ...reports.map(report => ({ at: report.published_at, label: "리포트 발송" })),
        { at: row.enrolled_at, label: "등록 완료" }, { at: row.lost_at, label: "미등록" },
        { at: row.canceled_at, label: "취소" }, { at: row.no_show_at, label: "불참" },
        { at: latestContacts.get(row.id) ?? null, label: "상담 기록" }
      ].filter((item): item is { at: string; label: string } => Boolean(item.at) && Number.isFinite(Date.parse(item.at!)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      return { id: row.id, student: { name: row.child_name ?? "학생 정보 삭제됨", grade: row.child_grade ?? "" }, guardian: { name: row.parent_name, phone: row.parent_phone },
        klass: { title: klass?.title ?? null, subject: klass?.subject ?? null }, assignee: { teacherName: row.assigned_teacher_id ? names.get(row.assigned_teacher_id) ?? null : null },
        registrationStatus: row.registration_status, registrationReasonIds: row.registration_reason_ids ?? [], workflow, requestedSlotAt: row.requested_slot_at,
        confirmedSlotAt: block?.start_at ?? row.confirmed_slot_at, latestRecord: candidates[0] ?? null,
        resultRecord: resultRecords.get(row.id) }
    })
    return { data: result, error: null }
  } catch {
    return { data: empty(page), error: "신청 관리 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }
}

/** 홈 "체험에서 등록까지" 칸. */
export type StudioCaseStageKey = "schedule" | "record" | "report" | "registration"
export type StudioCaseStageCard = Pick<CasesListItem, "id" | "student" | "klass" | "requestedSlotAt" | "confirmedSlotAt"> & {
  /** 상세에서 열 단계 칸(CASES_ACTION_SECTIONS). */
  section: string | null
  createdAt: string
  completedAt: string | null
  reportSentAt: string | null
  /** 과목 대분류 코드(3D 아이콘). */
  subjectCategory: string | null
  /** 확정 + 예정 종료 시각 지남 + 완료 처리 전(공용 판정). "기록 작성" 칸 맨 앞에 둔다. */
  completionNeeded: boolean
  /** 학부모 체험 의견이 있는가(등록 결과 칸). */
  hasParentFeedback: boolean
}
export type StudioCaseStageBoard = Record<StudioCaseStageKey, { count: number; items: StudioCaseStageCard[] }> & {
  /** 체험 완료 · 등록 미정 신청의 다음 단계(홈 "가장 먼저" 카드 문장용). */
  completedActionById: Record<string, "record" | "report" | "registration">
}
const STAGE_BOARD_PREVIEW = 2
const categoryOf = (klass: CaseRow["classes"] extends Embedded<infer T> ? T | null : never) => {
  if (!klass) return null
  const category = single(klass.report_category ?? null), subject = single(klass.report_subject ?? null)
  return getReportSubjectCategory(category?.code ?? single(subject?.subject_categories ?? null)?.code, subject?.code, klass.subject)
}
/**
 * 홈 4칸(일정 확정 · 기록 작성 · 리포트 보내기 · 등록 결과). 읽기 전용.
 * 신청 목록과 같은 조건(createCaseQueryBuilder · 필터 신규 신청 / 체험 예정·진행 / 등록 여부 미정) · 같은 판정(deriveCasesWorkflow) ·
 * 같은 정렬(orderStudioCases)로 칸마다 건수와 앞의 2건만 돌려준다. 새 판정을 만들지 않는다.
 * - 일정 확정 칸은 오래 기다린 신청(신청일 오래된 순)이 앞이다.
 * - "완료 확인 필요"(확정 + 예정 종료 시각 지남 · 완료 처리 전)는 기록 작성 칸 맨 앞에 더한다.
 */
export async function getStudioCaseStageBoard(organizationId: string): Promise<QueryResult<StudioCaseStageBoard>> {
  const board: StudioCaseStageBoard = { schedule: { count: 0, items: [] }, record: { count: 0, items: [] }, report: { count: 0, items: [] }, registration: { count: 0, items: [] }, completedActionById: {} }
  try {
    const supabase = await getSupabaseServerClient()
    const now = new Date()
    const cohorts = [{ view: "active", filter: "schedule_needed" }, { view: "active", filter: "confirmed" }, { view: "closed", filter: "undecided" }] as const
    const columns: Record<StudioCaseStageKey, StudioCaseStageCard[]> = { schedule: [], record: [], report: [], registration: [] }
    const completionNeeded: StudioCaseStageCard[] = []
    for (const options of cohorts) {
      const buildQuery = await createCaseQueryBuilder(supabase, organizationId, options)
      const cohort = await readAllRows<CaseRow>((from, to) => buildQuery().range(from, to))
      // 미정 칸의 정렬은 등록 결과 기록을 쓰지 않는다(orderStudioCases). 결과 기록을 따로 읽지 않는다.
      for (const row of orderStudioCases(cohort, options.view, options.filter, new Map(), now)) {
        if (row.child_name === null) continue
        const schedule = single(row.class_schedules), block = single(row.confirmed_block), klass = single(row.classes)
        const records = many(row.record), reports = many(row.report)
        const workflow = deriveCasesWorkflow({ status: row.status, registrationStatus: row.registration_status, canceledAt: row.canceled_at, noShowAt: row.no_show_at,
          recordFinalized: records.length > 0, reportSent: reports.length > 0,
          confirmedBlockStartAt: block?.start_at ?? null, confirmedBlockEndAt: block?.end_at ?? null,
          confirmedSlotAt: row.confirmed_slot_at, scheduleStartTime: schedule?.start_time ?? null, scheduleEndTime: schedule?.end_time ?? null }, now)
        const isCompletionNeeded = options.filter === "confirmed" && workflow.progress === "완료 확인 필요"
        const key: StudioCaseStageKey | null = isCompletionNeeded ? "record"
          : options.filter === "confirmed" ? null
          : workflow.filter === "schedule_needed" ? "schedule"
          : workflow.action === "record" || workflow.action === "report" || workflow.action === "registration" ? workflow.action : null
        if (options.view === "closed" && (workflow.action === "record" || workflow.action === "report" || workflow.action === "registration")) board.completedActionById[row.id] = workflow.action
        if (!key) continue
        const card: StudioCaseStageCard = {
          id: row.id, student: { name: row.child_name, grade: row.child_grade ?? "" }, klass: { title: klass?.title ?? null, subject: klass?.subject ?? null },
          requestedSlotAt: row.requested_slot_at, confirmedSlotAt: block?.start_at ?? row.confirmed_slot_at,
          section: isCompletionNeeded ? null : workflow.action ? CASES_ACTION_SECTIONS[workflow.action] : null,
          createdAt: row.created_at, completedAt: row.completed_at, reportSentAt: reports.map(report => report.published_at).sort()[0] ?? null,
          subjectCategory: categoryOf(klass), completionNeeded: isCompletionNeeded, hasParentFeedback: false
        }
        if (isCompletionNeeded) completionNeeded.push(card)
        else columns[key].push(card)
      }
    }
    // 일정 확정: 오래 기다린 신청이 앞(신청일 오래된 순). 표시 순서만 바꾼다.
    columns.schedule.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    columns.record = [...completionNeeded, ...columns.record]
    for (const key of Object.keys(columns) as StudioCaseStageKey[]) board[key] = { count: columns[key].length, items: columns[key].slice(0, STAGE_BOARD_PREVIEW) }
    const registrationIds = board.registration.items.map(card => card.id)
    if (registrationIds.length) {
      // 학부모 의견이 있는지만 본다(내용은 읽지 않는다).
      const { data, error } = await supabase.from("experience_feedback").select("application_id").in("application_id", registrationIds)
      if (error) throw error
      const withFeedback = new Set((data ?? []).map(row => row.application_id))
      for (const card of board.registration.items) card.hasParentFeedback = withFeedback.has(card.id)
    }
    return { data: board, error: null }
  } catch {
    return { data: board, error: "진행 단계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
}
