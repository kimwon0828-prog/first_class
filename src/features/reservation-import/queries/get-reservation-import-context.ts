import "server-only"

import type { ReservationImportContext } from "@/features/reservation-import/lib/reservation-import-preview"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// 양식/검증에 필요한 학원 정보를 한 번에 읽는다.
//
// 사용자에게 UUID 를 입력시키지 않으므로, 표시 이름 → id 매핑을 서버가 만든다.
// 같은 이름이 둘 이상이면 ambiguous 로 표시해 사용자가 고르게 한다.

export type ReservationImportOption = {
  id: string
  label: string
  ambiguous: boolean
}

export type ReservationImportOrganizationContext = {
  classes: ReservationImportOption[]
  teachers: ReservationImportOption[]
}

const buildLabelMap = (items: ReservationImportOption[]) =>
  new Map(items.map((item) => [item.label, item]))

/** 같은 이름이 여러 개면 구분 라벨을 붙이고, 그래도 겹치면 ambiguous 로 남긴다. */
const withDisambiguation = (
  rows: Array<{ id: string; name: string; hint: string | null }>
): ReservationImportOption[] => {
  const countByName = new Map<string, number>()
  for (const row of rows) {
    countByName.set(row.name, (countByName.get(row.name) ?? 0) + 1)
  }

  const labeled = rows.map((row) => {
    const duplicated = (countByName.get(row.name) ?? 0) > 1
    const label = duplicated && row.hint ? `${row.name} · ${row.hint}` : row.name
    return { id: row.id, label, ambiguous: false }
  })

  const countByLabel = new Map<string, number>()
  for (const item of labeled) {
    countByLabel.set(item.label, (countByLabel.get(item.label) ?? 0) + 1)
  }

  return labeled.map((item) => ({
    ...item,
    ambiguous: (countByLabel.get(item.label) ?? 0) > 1
  }))
}

export const getReservationImportOrganizationContext = async (
  organizationId: string
): Promise<ReservationImportOrganizationContext> => {
  const supabase = await getSupabaseServerClient()

  const [classResult, teacherResult] = await Promise.all([
    supabase
      .from("classes")
      .select("id, title, subject, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("teachers")
      .select("id, display_name, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("display_name", { ascending: true })
  ])

  if (classResult.error) {
    throw new Error("failed_to_fetch_import_classes")
  }

  if (teacherResult.error) {
    throw new Error("failed_to_fetch_import_teachers")
  }

  const classes = withDisambiguation(
    ((classResult.data ?? []) as Array<{ id: string; title: string; subject: string | null }>).map(
      (row) => ({ id: row.id, name: row.title, hint: row.subject })
    )
  )

  const teachers = withDisambiguation(
    ((teacherResult.data ?? []) as Array<{ id: string; display_name: string }>).map((row) => ({
      id: row.id,
      name: row.display_name,
      hint: null
    }))
  )

  return { classes, teachers }
}

/** 검증에 필요한 조직 상태 전체(수업·선생님·기존 지문·기존 일정). */
export const buildReservationImportContext = async (
  organizationId: string
): Promise<ReservationImportContext> => {
  const supabase = await getSupabaseServerClient()
  const { classes, teachers } = await getReservationImportOrganizationContext(organizationId)

  const classIds = classes.map((item) => item.id)

  const [fingerprintResult, scheduleResult] = await Promise.all([
    supabase
      .from("studio_import_rows")
      .select("fingerprint, studio_import_batches!inner(organization_id)")
      .eq("studio_import_batches.organization_id", organizationId),
    classIds.length > 0
      ? supabase
          .from("schedule_blocks")
          .select("start_at")
          .in("class_id", classIds)
          .gte("start_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      : null
  ])

  // 지문/일정 조회 실패는 경고 판정을 못 하게 할 뿐이다. 가져오기 자체를 막지 않는다.
  const existingFingerprints = new Set(
    fingerprintResult.error
      ? []
      : ((fingerprintResult.data ?? []) as Array<{ fingerprint: string }>).map(
          (row) => row.fingerprint
        )
  )

  const existingScheduleStartAts = new Set(
    !scheduleResult || scheduleResult.error
      ? []
      : ((scheduleResult.data ?? []) as Array<{ start_at: string }>).map((row) =>
          new Date(row.start_at).toISOString()
        )
  )

  return {
    organizationId,
    classesByLabel: buildLabelMap(classes),
    teachersByLabel: buildLabelMap(teachers),
    existingFingerprints,
    existingScheduleStartAts,
    now: new Date()
  }
}
