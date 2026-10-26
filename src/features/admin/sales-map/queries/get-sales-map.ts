import "server-only"

import {
  isSalesState,
  resolveDefaultSalesState,
  type SalesProspectView,
  type SalesSubjectView
} from "@/features/admin/sales-map/lib/sales-status"
import { SALES_BRANDS, SALES_PROSPECTS, SALES_SUBJECTS } from "@/features/admin/sales-map/prospects"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type SalesProspectStatusRow = {
  prospect_id: string
  state: string
  memo: string
  visited_on: string | null
}

export type SalesMapData = {
  subjects: SalesSubjectView[]
  prospects: SalesProspectView[]
}

/* 씨큐브는 크레버스 브랜드로 센다. */
const BRAND_ALIASES: Record<string, string> = {
  씨큐브: "크레버스"
}

const resolveBrandKey = (prospectId: string, name: string) => {
  const compactName = name.replace(/\s+/g, "")
  const brand = SALES_BRANDS.find((candidate) => compactName.includes(candidate))

  if (!brand) {
    return `prospect:${prospectId}`
  }

  return `brand:${BRAND_ALIASES[brand] ?? brand}`
}

/** 호출 전에 requireAdmin 을 거친다. */
export const getSalesMap = async (): Promise<SalesMapData> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("admin_sales_prospect_status")
    .select("prospect_id, state, memo, visited_on")

  if (error) {
    throw new Error("failed_to_fetch_admin_sales_prospect_status")
  }

  const rowById = new Map(
    ((data ?? []) as SalesProspectStatusRow[]).map((row) => [row.prospect_id, row])
  )

  return {
    subjects: SALES_SUBJECTS.map((subject) => ({ key: subject.key, core: subject.core })),
    prospects: SALES_PROSPECTS.map((prospect) => {
      const row = rowById.get(prospect.id)

      return {
        id: prospect.id,
        grade: prospect.grade,
        type: prospect.type,
        subject: prospect.subject,
        ownership: prospect.ownership,
        name: prospect.name,
        phone: prospect.phone,
        address: prospect.address,
        elementaryShare: prospect.elementaryShare,
        note: prospect.note,
        brandKey: resolveBrandKey(prospect.id, prospect.name),
        status: {
          state: row && isSalesState(row.state) ? row.state : resolveDefaultSalesState(prospect.id),
          memo: row?.memo ?? "",
          visitedOn: row?.visited_on ?? null
        }
      }
    })
  }
}
