"use server"

import { requireAdmin } from "@/features/admin/lib/require-admin"
import {
  isSalesState,
  resolveDefaultSalesState,
  SALES_MEMO_MAX_LENGTH,
  toKstDateKey,
  type SalesState,
  type SalesStatusUpdateInput,
  type SalesStatusUpdateResult
} from "@/features/admin/sales-map/lib/sales-status"
import { SALES_PROSPECTS } from "@/features/admin/sales-map/prospects"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { ActionResult } from "@/shared/actions"

type SalesProspectStatusRow = {
  prospect_id: string
  state: SalesState
  memo: string
  visited_on: string | null
}

const PROSPECT_IDS = new Set(SALES_PROSPECTS.map((prospect) => prospect.id))
const STATUS_COLUMNS = "prospect_id, state, memo, visited_on"
const UNIQUE_VIOLATION = "23505"

const toResult = (row: SalesProspectStatusRow): ActionResult<SalesStatusUpdateResult> => ({
  ok: true,
  data: {
    prospectId: row.prospect_id,
    status: {
      state: row.state,
      memo: row.memo,
      visitedOn: row.visited_on
    }
  }
})

export async function updateSalesProspectStatusAction(
  input: SalesStatusUpdateInput
): Promise<ActionResult<SalesStatusUpdateResult>> {
  const admin = await requireAdmin("/admin/sales-map")
  const prospectId = typeof input?.prospectId === "string" ? input.prospectId : ""

  if (!PROSPECT_IDS.has(prospectId)) {
    return { ok: false, message: "목록에 없는 학원입니다." }
  }

  if (input.state !== undefined && !isSalesState(input.state)) {
    return { ok: false, message: "알 수 없는 상태입니다." }
  }

  if (input.memo !== undefined && typeof input.memo !== "string") {
    return { ok: false, message: "메모 형식이 올바르지 않습니다." }
  }

  const memo = input.memo?.trim()

  if (memo !== undefined && memo.length > SALES_MEMO_MAX_LENGTH) {
    return { ok: false, message: `메모는 ${SALES_MEMO_MAX_LENGTH}자까지 입력할 수 있습니다.` }
  }

  if (input.state === undefined && memo === undefined) {
    return { ok: false, message: "바꿀 내용이 없습니다." }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const table = () => serviceRoleClient.from("admin_sales_prospect_status")

  const { data: existingData, error: readError } = await table()
    .select(STATUS_COLUMNS)
    .eq("prospect_id", prospectId)
    .maybeSingle()

  if (readError) {
    return { ok: false, message: "현재 상태를 불러오지 못했습니다." }
  }

  const existing = existingData as SalesProspectStatusRow | null
  const currentState = existing && isSalesState(existing.state) ? existing.state : resolveDefaultSalesState(prospectId)
  const nextState = input.state ?? currentState
  /* 미접촉에서 처음 벗어나는 날을 방문일로 남긴다. */
  const visitedOn =
    !existing?.visited_on && currentState === "미접촉" && nextState !== "미접촉"
      ? toKstDateKey(new Date())
      : undefined

  const patch = {
    ...(input.state !== undefined ? { state: input.state } : {}),
    ...(memo !== undefined ? { memo } : {}),
    ...(visitedOn ? { visited_on: visitedOn } : {}),
    updated_at: new Date().toISOString(),
    updated_by: admin.id
  }

  const updateExisting = async () => {
    const { data, error } = await table().update(patch).eq("prospect_id", prospectId).select(STATUS_COLUMNS).single()
    return error || !data ? null : (data as SalesProspectStatusRow)
  }

  if (existing) {
    const updated = await updateExisting()
    return updated ? toResult(updated) : { ok: false, message: "저장하지 못했습니다." }
  }

  const { data: inserted, error: insertError } = await table()
    .insert({ prospect_id: prospectId, state: nextState, memo: memo ?? "", ...patch })
    .select(STATUS_COLUMNS)
    .single()

  if (!insertError && inserted) {
    return toResult(inserted as SalesProspectStatusRow)
  }

  /* 다른 기기가 먼저 행을 만들었으면 바꾼 항목만 덮어쓴다. */
  if (insertError?.code === UNIQUE_VIOLATION) {
    const updated = await updateExisting()
    if (updated) {
      return toResult(updated)
    }
  }

  return { ok: false, message: "저장하지 못했습니다." }
}
