import "server-only"
import { CASE_PAGE_SIZE, getCaseFilterPredicate, sanitizeCaseSearchQuery, type CaseFilterKey, type CaseViewKey } from "@/features/studio/lib/case-filters"
import { deriveCasesWorkflow, type CasesListItem } from "@/features/studio/lib/cases-workflow"
import { getCasesResultRecord, orderStudioCases, type CasesOrderRow, type CasesOrderLog, type CasesRegistrationClock, type CasesResultRecord } from "@/features/studio/lib/cases-order"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { ApplicationRegistrationStatus, ApplicationStatus } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

// Cases has an existing direct query boundary; no adapter or mutation contract changes.
// Embedded record/report existence is filtered BEFORE count/range, never after pagination.
// report means any sent snapshot: withdrawal cannot reopen publication under Phase 1.
export const CASE_SELECT_FIELDS =
  "id, child_name, child_grade, parent_name, parent_phone, assigned_teacher_id, " +
  "requested_slot_at, confirmed_slot_at, status, registration_status, registration_reason_ids, created_at, completed_at, enrolled_at, canceled_at, no_show_at, lost_at, next_contact_at, " +
  "class_schedules(start_time,end_time), " +
  "confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at,end_at), " +
  "record:trial_results(application_id,created_at),report:experience_reports(application_id,published_at), " +
  "classes!inner(id,title,subject,organization_id)"
type Embedded<T> = T | T[] | null
const single = <T,>(value: Embedded<T>): T | null => Array.isArray(value) ? value.length === 1 ? value[0] : null : value
const many = <T,>(value: Embedded<T>): T[] => Array.isArray(value) ? value : value ? [value] : []
type CaseRow = CasesOrderRow & {
  id: string; child_name: string; child_grade: string; parent_name: string | null; parent_phone: string | null
  assigned_teacher_id: string | null; requested_slot_at: string; confirmed_slot_at: string | null
  status: ApplicationStatus; registration_status: ApplicationRegistrationStatus; registration_reason_ids: string[] | null
  created_at: string; completed_at: string | null; enrolled_at: string | null; canceled_at: string | null; no_show_at: string | null; lost_at: string | null
  classes: Embedded<{ title: string | null; subject: string | null }>
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
export async function getStudioCases(organizationId: string, options: GetStudioCasesOptions): Promise<QueryResult<StudioCasesQueryData>> {
  const page = Math.max(1, options.page ?? 1), search = sanitizeCaseSearchQuery(options.query)
  try {
    const supabase = await getSupabaseServerClient()
    let classIds: string[] = []
    if (search) {
      const matches = await readAllRows<{ id: string }>((from, to) => supabase.from("classes").select("id", { count: "exact" })
        .eq("organization_id", organizationId).ilike("title", `%${search}%`).order("id").range(from, to))
      classIds = matches.map(row => row.id)
    }
    const buildQuery = () => {
      let query = supabase.from("studio_trial_applications").select(CASE_SELECT_FIELDS, { count: "exact" })
        .eq("classes.organization_id", organizationId)
        .or(getCaseFilterPredicate(options.view, options.filter).orExpression)
      if (search) {
        const terms = [`child_name.ilike.%${search}%`, `parent_name.ilike.%${search}%`, `parent_phone.ilike.%${search}%`]
        if (classIds.length) terms.push(`class_id.in.(${classIds.join(",")})`)
        query = query.or(terms.join(","))
      }
      return query.order("id", { ascending: true })
    }
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
      const candidates = [
        { at: row.created_at, label: "신청 접수" }, { at: row.completed_at, label: "체험 완료" },
        ...records.map(record => ({ at: record.created_at, label: "체험 기록 완료" })),
        ...reports.map(report => ({ at: report.published_at, label: "리포트 발송" })),
        { at: row.enrolled_at, label: "등록 완료" }, { at: row.lost_at, label: "미등록" },
        { at: row.canceled_at, label: "취소" }, { at: row.no_show_at, label: "노쇼" },
        { at: latestContacts.get(row.id) ?? null, label: "상담 기록" }
      ].filter((item): item is { at: string; label: string } => Boolean(item.at) && Number.isFinite(Date.parse(item.at!)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      return { id: row.id, student: { name: row.child_name, grade: row.child_grade }, guardian: { name: row.parent_name, phone: row.parent_phone },
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
