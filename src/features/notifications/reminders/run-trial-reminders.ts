import "server-only"

import { logSmsEvent } from "@/features/notifications/sms/log-sms-event"
import type { SmsEventType } from "@/features/notifications/sms/types"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type EmbeddedClassRow = {
  title: string
  organization_id: string | null
}

type TrialReminderCandidateRow = {
  id: string
  class_id: string
  parent_id: string
  child_name: string
  parent_name: string | null
  parent_phone: string | null
  requested_slot_at: string
  confirmed_slot_at: string | null
  selected_schedule_label: string | null
  assigned_teacher_id: string | null
  classes: EmbeddedClassRow | EmbeddedClassRow[] | null
}

type OrganizationRow = {
  id: string
  name: string
}

type SmsLogRow = {
  trial_application_id: string | null
  event_type: SmsEventType
}

type TrialReminderCandidate = {
  id: string
  organizationId: string
  academyName: string | null
  classId: string
  classTitle: string | null
  parentId: string
  parentName: string | null
  parentPhone: string | null
  childName: string
  requestedSlotAt: string
  confirmedSlotAt: string | null
  selectedScheduleLabel: string | null
  assignedTeacherId: string | null
}

type TrialReminderRange = {
  todayStartIso: string
  tomorrowStartIso: string
  dayAfterTomorrowStartIso: string
}

type TrialReminderRunResult = {
  ok: boolean
  authMode: "public_dev" | "shared_secret"
  range: TrialReminderRange
  totalCandidates: number
  parentSent: number
  parentSkippedDuplicate: number
  parentFailed: number
  teacherSent: number
  teacherSkippedDuplicate: number
  teacherFailed: number
  notes: string[]
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const PARENT_REMINDER_EVENT: SmsEventType = "trial_reminder"
const TEACHER_REMINDER_EVENT: SmsEventType = "teacher_trial_reminder"

const getEmbeddedClass = (value: TrialReminderCandidateRow["classes"]) => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? (value[0] ?? null) : value
}

const resolveTodayRangeInKst = (baseDate = new Date()): TrialReminderRange => {
  const shifted = new Date(baseDate.getTime() + KST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth()
  const date = shifted.getUTCDate()
  const todayStartMs = Date.UTC(year, month, date) - KST_OFFSET_MS
  const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000
  const dayAfterTomorrowStartMs = tomorrowStartMs + 24 * 60 * 60 * 1000

  return {
    todayStartIso: new Date(todayStartMs).toISOString(),
    tomorrowStartIso: new Date(tomorrowStartMs).toISOString(),
    dayAfterTomorrowStartIso: new Date(dayAfterTomorrowStartMs).toISOString()
  }
}

const isAlimtalkEnabled = () => process.env.ALIMTALK_SEND_ENABLED === "true"

const listReminderCandidates = async (range: TrialReminderRange): Promise<TrialReminderCandidate[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("trial_applications")
    .select(
      "id, class_id, parent_id, child_name, parent_name, parent_phone, requested_slot_at, confirmed_slot_at, selected_schedule_label, assigned_teacher_id, classes!inner(title, organization_id)"
    )
    .eq("status", "confirmed")
    .gte("confirmed_slot_at", range.tomorrowStartIso)
    .lt("confirmed_slot_at", range.dayAfterTomorrowStartIso)
    .order("confirmed_slot_at", { ascending: true })

  if (error) {
    throw new Error("failed_to_fetch_trial_reminder_candidates")
  }

  const rows = (data ?? []) as TrialReminderCandidateRow[]
  const organizationIds = Array.from(
    new Set(
      rows
        .map((row) => getEmbeddedClass(row.classes)?.organization_id ?? null)
        .filter((value): value is string => Boolean(value))
    )
  )

  const organizationNameById = new Map<string, string>()
  if (organizationIds.length > 0) {
    const { data: organizationData, error: organizationError } = await serviceRoleClient
      .from("organizations")
      .select("id, name")
      .in("id", organizationIds)

    if (organizationError) {
      throw new Error("failed_to_fetch_trial_reminder_organizations")
    }

    for (const row of (organizationData ?? []) as OrganizationRow[]) {
      organizationNameById.set(row.id, row.name)
    }
  }

  return rows.flatMap((row) => {
    const embeddedClass = getEmbeddedClass(row.classes)
    const organizationId = embeddedClass?.organization_id ?? null

    if (!organizationId) {
      return []
    }

    return [
      {
        id: row.id,
        organizationId,
        academyName: organizationNameById.get(organizationId) ?? null,
        classId: row.class_id,
        classTitle: embeddedClass?.title ?? null,
        parentId: row.parent_id,
        parentName: row.parent_name ?? null,
        parentPhone: row.parent_phone ?? null,
        childName: row.child_name,
        requestedSlotAt: row.requested_slot_at,
        confirmedSlotAt: row.confirmed_slot_at ?? null,
        selectedScheduleLabel: row.selected_schedule_label ?? null,
        assignedTeacherId: row.assigned_teacher_id ?? null
      }
    ]
  })
}

const getExistingReminderLogKeys = async (
  applicationIds: string[],
  range: TrialReminderRange
): Promise<Set<string>> => {
  if (applicationIds.length === 0) {
    return new Set()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("sms_logs")
    .select("trial_application_id, event_type")
    .in("trial_application_id", applicationIds)
    .in("event_type", [PARENT_REMINDER_EVENT, TEACHER_REMINDER_EVENT])
    .gte("created_at", range.todayStartIso)
    .lt("created_at", range.tomorrowStartIso)

  if (error) {
    throw new Error("failed_to_fetch_existing_trial_reminder_logs")
  }

  return new Set(
    ((data ?? []) as SmsLogRow[])
      .filter((row): row is SmsLogRow & { trial_application_id: string } => Boolean(row.trial_application_id))
      .map((row) => `${row.trial_application_id}:${row.event_type}`)
  )
}

const sendParentTrialReminder = async (candidate: TrialReminderCandidate) => {
  if (isAlimtalkEnabled()) {
    // Alimtalk integration can replace this branch later. For MVP, SMS remains the fallback path.
  }

  await logSmsEvent({
    organizationId: candidate.organizationId,
    application: {
      id: candidate.id,
      academyName: candidate.academyName,
      classId: candidate.classId,
      parentId: candidate.parentId,
      childName: candidate.childName,
      parentName: candidate.parentName,
      parentPhone: candidate.parentPhone,
      classTitle: candidate.classTitle,
      requestedSlotAt: candidate.requestedSlotAt,
      confirmedSlotAt: candidate.confirmedSlotAt,
      selectedScheduleLabel: candidate.selectedScheduleLabel,
      assignedTeacherId: candidate.assignedTeacherId,
      assignedTeacherName: null
    },
    createdBy: null,
    recipientType: "parent",
    eventType: PARENT_REMINDER_EVENT
  })
}

const sendTeacherTrialReminder = async (candidate: TrialReminderCandidate) => {
  await logSmsEvent({
    organizationId: candidate.organizationId,
    application: {
      id: candidate.id,
      academyName: candidate.academyName,
      classId: candidate.classId,
      parentId: candidate.parentId,
      childName: candidate.childName,
      parentName: candidate.parentName,
      parentPhone: candidate.parentPhone,
      classTitle: candidate.classTitle,
      requestedSlotAt: candidate.requestedSlotAt,
      confirmedSlotAt: candidate.confirmedSlotAt,
      selectedScheduleLabel: candidate.selectedScheduleLabel,
      assignedTeacherId: candidate.assignedTeacherId,
      assignedTeacherName: null
    },
    createdBy: null,
    recipientType: "teacher",
    eventType: TEACHER_REMINDER_EVENT
  })
}

export const runTrialReminders = async (authMode: TrialReminderRunResult["authMode"]) => {
  const range = resolveTodayRangeInKst()
  const candidates = await listReminderCandidates(range)
  const existingLogKeys = await getExistingReminderLogKeys(
    candidates.map((candidate) => candidate.id),
    range
  )

  const result: TrialReminderRunResult = {
    ok: true,
    authMode,
    range,
    totalCandidates: candidates.length,
    parentSent: 0,
    parentSkippedDuplicate: 0,
    parentFailed: 0,
    teacherSent: 0,
    teacherSkippedDuplicate: 0,
    teacherFailed: 0,
    notes: [
      "기준 시간대는 Asia/Seoul(KST) 입니다.",
      "teacher_trial_reminder 이벤트 타입은 sms_logs 제약 migration 적용 여부를 별도로 확인해야 합니다."
    ]
  }

  for (const candidate of candidates) {
    const parentLogKey = `${candidate.id}:${PARENT_REMINDER_EVENT}`
    if (existingLogKeys.has(parentLogKey)) {
      result.parentSkippedDuplicate += 1
    } else {
      try {
        await sendParentTrialReminder(candidate)
        existingLogKeys.add(parentLogKey)
        result.parentSent += 1
      } catch (error) {
        console.error("[trial reminder][parent] failed", candidate.id, error)
        result.parentFailed += 1
      }
    }

    const teacherLogKey = `${candidate.id}:${TEACHER_REMINDER_EVENT}`
    if (existingLogKeys.has(teacherLogKey)) {
      result.teacherSkippedDuplicate += 1
      continue
    }

    try {
      await sendTeacherTrialReminder(candidate)
      existingLogKeys.add(teacherLogKey)
      result.teacherSent += 1
    } catch (error) {
      console.error("[trial reminder][teacher] failed", candidate.id, error)
      result.teacherFailed += 1
    }
  }

  return result
}
