import "server-only"

import {
  CASE_PAGE_SIZE,
  getCaseFilterPredicate,
  sanitizeCaseSearchQuery,
  type CaseFilterKey,
  type CaseFilterPredicate,
  type CaseViewKey
} from "@/features/studio/lib/case-filters"
import {
  getCaseAttentionState,
  getCaseDisplayStage,
  getCaseNextAction,
  type CaseAttentionInput,
  type StudioCaseListItem
} from "@/features/studio/lib/case-view-model"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type {
  ApplicationRegistrationStatus,
  ApplicationStatus,
  ConsultationLogChannel,
  ConsultationSentiment
} from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

// Case 목록 전용 조회.
//
// adapter 를 거치지 않고 Supabase 를 직접 쓴다. 이 화면은 view/filter/검색/pagination 조합이
// 런타임에 정해지므로 고정 시그니처의 adapter method 로 표현하기 어렵고,
// features/classes/queries/* 나 studio actions 와 같은 기존 예외 패턴을 따른다.
//
// ⚠️ trial_applications 에는 organization_id 가 없다. 조직 스코프는 반드시
// classes!inner(organization_id) 조인으로 건다. RLS 는 2차 방어선이지 1차가 아니다.
//
// N+1 방지: 목록 row 를 먼저 페이지 크기만큼 확정한 뒤,
// teachers / consultation_logs / trial_results / profiles 를 각각 IN 배치로 한 번씩만 읽는다.

const CASE_SELECT_FIELDS =
  "id, class_id, child_name, child_grade, parent_name, parent_phone, assigned_teacher_id, " +
  "requested_slot_at, confirmed_slot_at, status, registration_status, created_at, completed_at, " +
  "enrolled_at, canceled_at, no_show_at, lost_at, next_contact_at, last_activity_at, " +
  // 확정 체험의 종료 시각 판정에 필요한 값. 둘 다 embed 라 query 는 늘지 않는다.
  // schedule_blocks 는 이 테이블과 관계가 3개라 FK 이름 hint 없이는 모호하다(PGRST201).
  "class_schedules(start_time, end_time), " +
  "confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(end_at), " +
  "classes!inner(id, title, subject, organization_id)"

type CaseScheduleRow = {
  start_time: string | null
  end_time: string | null
}

type CaseConfirmedBlockRow = {
  end_at: string | null
}

type CaseClassRow = {
  id: string
  title: string | null
  subject: string | null
  organization_id: string
}

type CaseApplicationRow = {
  id: string
  class_id: string
  child_name: string
  child_grade: string
  parent_name: string | null
  parent_phone: string | null
  assigned_teacher_id: string | null
  requested_slot_at: string
  confirmed_slot_at: string | null
  status: ApplicationStatus
  registration_status: ApplicationRegistrationStatus
  created_at: string
  completed_at: string | null
  enrolled_at: string | null
  canceled_at: string | null
  no_show_at: string | null
  lost_at: string | null
  next_contact_at: string | null
  last_activity_at: string | null
  classes: CaseClassRow | CaseClassRow[] | null
  class_schedules: CaseScheduleRow | CaseScheduleRow[] | null
  confirmed_block: CaseConfirmedBlockRow | CaseConfirmedBlockRow[] | null
}

type CaseConsultationLogRow = {
  application_id: string
  occurred_at: string
  activity_type: string
  channel: ConsultationLogChannel | null
  sentiment: ConsultationSentiment | null
  note: string | null
  created_by: string | null
}

export type GetStudioCasesOptions = {
  view: CaseViewKey
  filter: CaseFilterKey
  query?: string | null
  page?: number
}

export type StudioCasesQueryData = {
  items: StudioCaseListItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

const createEmptyData = (page: number): StudioCasesQueryData => ({
  items: [],
  page,
  pageSize: CASE_PAGE_SIZE,
  totalCount: 0,
  totalPages: 0
})

const getEmbeddedClass = (row: CaseApplicationRow): CaseClassRow | null => {
  if (Array.isArray(row.classes)) {
    return row.classes[0] ?? null
  }

  return row.classes ?? null
}

/**
 * 신청이 실제로 예약한 수업 시간 한 개.
 *
 * class_schedule_id 가 class_schedules 로 가는 FK 라 embed 는 to-one 이다.
 * 한 class 에 수업 시간이 여러 개 있어도 이 embed 는 그 신청이 고른 하나만 돌려준다.
 * 그래도 배열이 두 개 이상으로 오면 특정할 수 없으므로 첫 번째를 고르지 않고 null 이다.
 */
/** 확정된 예약 블록 한 개. to-one FK 지만 배열이 둘 이상이면 특정할 수 없어 null 이다. */
const getEmbeddedConfirmedBlock = (row: CaseApplicationRow): CaseConfirmedBlockRow | null => {
  if (!row.confirmed_block) {
    return null
  }

  if (!Array.isArray(row.confirmed_block)) {
    return row.confirmed_block
  }

  return row.confirmed_block.length === 1 ? row.confirmed_block[0] : null
}

const getEmbeddedSchedule = (row: CaseApplicationRow): CaseScheduleRow | null => {
  if (!row.class_schedules) {
    return null
  }

  if (!Array.isArray(row.class_schedules)) {
    return row.class_schedules
  }

  return row.class_schedules.length === 1 ? row.class_schedules[0] : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyCasePredicate = <T>(query: T, predicate: CaseFilterPredicate): T => {
  // supabase-js 의 builder 는 체이닝마다 자기 자신을 돌려준다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next = query as any

  if (predicate.statusIn && predicate.statusIn.length > 0) {
    next = next.in("status", predicate.statusIn)
  }

  if (predicate.registrationStatusIn && predicate.registrationStatusIn.length > 0) {
    next = next.in("registration_status", predicate.registrationStatusIn)
  }

  if (predicate.noShowAt === "null") {
    next = next.is("no_show_at", null)
  } else if (predicate.noShowAt === "not_null") {
    next = next.not("no_show_at", "is", null)
  }

  if (predicate.orExpression) {
    next = next.or(predicate.orExpression)
  }

  return next as T
}

export const getStudioCases = async (
  organizationId: string,
  options: GetStudioCasesOptions
): Promise<QueryResult<StudioCasesQueryData>> => {
  const page = Math.max(1, options.page ?? 1)
  const searchQuery = sanitizeCaseSearchQuery(options.query)

  try {
    const supabase = await getSupabaseServerClient()

    // [Q1] 검색어가 있을 때만 수업명 매칭을 먼저 해석한다.
    //      trial_applications 의 or() 안에서는 조인된 classes 컬럼을 참조할 수 없어서
    //      class_id 목록으로 바꿔 넣는다.
    let matchedClassIds: string[] | null = null
    if (searchQuery) {
      const { data: classData, error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("title", `%${searchQuery}%`)
        .limit(200)

      if (classError) {
        throw new Error("failed_to_fetch_studio_case_classes")
      }

      matchedClassIds = ((classData ?? []) as Array<{ id: string }>).map((row) => row.id)
    }

    // [Q2] 본문 + 총 개수. range 로 DB 레벨 pagination 을 한다.
    let query = supabase
      .from("trial_applications")
      .select(CASE_SELECT_FIELDS, { count: "exact" })
      .eq("classes.organization_id", organizationId)

    query = applyCasePredicate(query, getCaseFilterPredicate(options.view, options.filter))

    if (searchQuery) {
      const escaped = `%${searchQuery}%`
      const searchTerms = [
        `child_name.ilike.${escaped}`,
        `parent_name.ilike.${escaped}`,
        `parent_phone.ilike.${escaped}`
      ]

      if (matchedClassIds && matchedClassIds.length > 0) {
        searchTerms.push(`class_id.in.(${matchedClassIds.join(",")})`)
      }

      query = query.or(searchTerms.join(","))
    }

    // 정렬은 DB 에서 끝낸다(클라이언트에서 자르지 않는다).
    //  - 완료·종료: 최근에 끝난 순
    //  - 진행 중: 신청 최신순(기존 /studio/applications 와 동일)
    if (options.view === "closed") {
      query = query.order("completed_at", { ascending: false, nullsFirst: false })
    }
    query = query.order("created_at", { ascending: false })

    const from = (page - 1) * CASE_PAGE_SIZE
    const { data, error, count } = await query.range(from, from + CASE_PAGE_SIZE - 1)

    if (error) {
      throw new Error("failed_to_fetch_studio_cases")
    }

    const rows = (data ?? []) as unknown as CaseApplicationRow[]
    const totalCount = count ?? 0
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / CASE_PAGE_SIZE) : 0

    if (rows.length === 0) {
      return {
        data: { items: [], page, pageSize: CASE_PAGE_SIZE, totalCount, totalPages },
        error: null
      }
    }

    const applicationIds = rows.map((row) => row.id)
    const teacherIds = Array.from(
      new Set(
        rows
          .map((row) => row.assigned_teacher_id)
          .filter((teacherId): teacherId is string => Boolean(teacherId))
      )
    )

    // [Q3~Q5] 페이지에 실린 row 에 대해서만 배치 조회한다. row 당 추가 query 는 없다.
    const [teacherResult, consultationResult, trialResultResult] = await Promise.all([
      teacherIds.length > 0
        ? supabase.from("teachers").select("id, display_name").in("id", teacherIds)
        : null,
      supabase
        .from("consultation_logs")
        .select("application_id, occurred_at, activity_type, channel, sentiment, note, created_by")
        .in("application_id", applicationIds)
        .order("occurred_at", { ascending: false }),
      supabase.from("trial_results").select("application_id").in("application_id", applicationIds)
    ])

    if (teacherResult?.error) {
      throw new Error("failed_to_fetch_studio_case_teachers")
    }

    if (consultationResult.error) {
      throw new Error("failed_to_fetch_studio_case_consultation_logs")
    }

    if (trialResultResult.error) {
      throw new Error("failed_to_fetch_studio_case_trial_results")
    }

    const teacherNameById = new Map<string, string>()
    for (const row of (teacherResult?.data ?? []) as Array<{ id: string; display_name: string }>) {
      teacherNameById.set(row.id, row.display_name)
    }

    const trialResultApplicationIds = new Set(
      ((trialResultResult.data ?? []) as Array<{ application_id: string }>).map(
        (row) => row.application_id
      )
    )

    // occurred_at desc 로 받았으므로 처음 등장하는 것이 최신이다.
    // 파이프라인 판정과 동일하게 CONSULTATION / LEGACY_IMPORT 만 "상담 이력" 으로 센다.
    const consultationCountById = new Map<string, number>()
    const hasAnyConsultationHistoryById = new Map<string, boolean>()
    const latestConsultationById = new Map<string, CaseConsultationLogRow>()

    for (const row of (consultationResult.data ?? []) as CaseConsultationLogRow[]) {
      if (row.activity_type !== "CONSULTATION" && row.activity_type !== "LEGACY_IMPORT") {
        continue
      }

      hasAnyConsultationHistoryById.set(row.application_id, true)

      if (row.activity_type === "LEGACY_IMPORT") {
        continue
      }

      consultationCountById.set(
        row.application_id,
        (consultationCountById.get(row.application_id) ?? 0) + 1
      )

      if (!latestConsultationById.has(row.application_id)) {
        latestConsultationById.set(row.application_id, row)
      }
    }

    // [Q6] 최신 상담의 작성자 이름. 작성자가 없으면 조회 자체가 발생하지 않는다.
    const consultationAuthorIds = Array.from(
      new Set(
        Array.from(latestConsultationById.values())
          .map((row) => row.created_by)
          .filter((createdBy): createdBy is string => Boolean(createdBy))
      )
    )

    const authorNameById = new Map<string, string>()
    if (consultationAuthorIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", consultationAuthorIds)

      if (profileError) {
        throw new Error("failed_to_fetch_studio_case_consultation_authors")
      }

      for (const row of (profileData ?? []) as Array<{ id: string; name: string | null }>) {
        if (row.name) {
          authorNameById.set(row.id, row.name)
        }
      }
    }

    const now = new Date()
    const items = rows.map((row): StudioCaseListItem => {
      const embeddedClass = getEmbeddedClass(row)
      const embeddedSchedule = getEmbeddedSchedule(row)
      const embeddedConfirmedBlock = getEmbeddedConfirmedBlock(row)
      const latestConsultation = latestConsultationById.get(row.id) ?? null

      const attentionInput: CaseAttentionInput = {
        status: row.status,
        noShowAt: row.no_show_at ?? null,
        registrationStatus: row.registration_status,
        assignedTeacherId: row.assigned_teacher_id ?? null,
        confirmedBlockEndAt: embeddedConfirmedBlock?.end_at ?? null,
        confirmedSlotAt: row.confirmed_slot_at ?? null,
        requestedSlotAt: row.requested_slot_at,
        scheduleStartTime: embeddedSchedule?.start_time ?? null,
        scheduleEndTime: embeddedSchedule?.end_time ?? null,
        trialResultExists: trialResultApplicationIds.has(row.id),
        hasAnyConsultationHistory: hasAnyConsultationHistoryById.get(row.id) ?? false,
        nextContactAt: row.next_contact_at ?? null
      }

      return {
        id: row.id,
        student: { name: row.child_name, grade: row.child_grade },
        guardian: { name: row.parent_name ?? null, phone: row.parent_phone ?? null },
        klass: {
          id: row.class_id,
          title: embeddedClass?.title ?? null,
          subject: embeddedClass?.subject ?? null
        },
        assignee: {
          teacherId: row.assigned_teacher_id ?? null,
          teacherName: row.assigned_teacher_id
            ? teacherNameById.get(row.assigned_teacher_id) ?? null
            : null
        },
        status: row.status,
        registrationStatus: row.registration_status,
        // 확정 체험의 종료 시각이 지났으면 표시만 체험 완료로 앞당긴다(DB 는 confirmed 그대로).
        stage: getCaseDisplayStage(attentionInput, now),
        scheduleStartTime: embeddedSchedule?.start_time ?? null,
        scheduleEndTime: embeddedSchedule?.end_time ?? null,
        requestedSlotAt: row.requested_slot_at,
        confirmedSlotAt: row.confirmed_slot_at ?? null,
        trialResultExists: attentionInput.trialResultExists,
        latestConsultation: latestConsultation
          ? {
              occurredAt: latestConsultation.occurred_at,
              channel: latestConsultation.channel,
              sentiment: latestConsultation.sentiment,
              note: latestConsultation.note?.trim() ? latestConsultation.note.trim() : null,
              createdByName: latestConsultation.created_by
                ? authorNameById.get(latestConsultation.created_by) ?? null
                : null
            }
          : null,
        consultationCount: consultationCountById.get(row.id) ?? 0,
        nextContactAt: row.next_contact_at ?? null,
        lastActivityAt: row.last_activity_at ?? null,
        attention: getCaseAttentionState(attentionInput, now),
        nextAction: getCaseNextAction(attentionInput, now),
        createdAt: row.created_at,
        completedAt: row.completed_at ?? null,
        enrolledAt: row.enrolled_at ?? null,
        lostAt: row.lost_at ?? null,
        canceledAt: row.canceled_at ?? null,
        noShowAt: row.no_show_at ?? null
      }
    })

    return {
      data: { items, page, pageSize: CASE_PAGE_SIZE, totalCount, totalPages },
      error: null
    }
  } catch {
    return {
      data: createEmptyData(page),
      error: "상담·등록 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
