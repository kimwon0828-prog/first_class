import { updateSalesProspectStatusAction } from "@/features/admin/sales-map/actions/update-sales-prospect-status"
import { requireAdmin } from "@/features/admin/lib/require-admin"
import { getSalesMap, type SalesMapData } from "@/features/admin/sales-map/queries/get-sales-map"
import { SalesMapClient } from "./sales-map-client"

export const metadata = {
  title: "영업 지도",
  robots: { index: false, follow: false }
}

export default async function AdminSalesMapPage() {
  await requireAdmin("/admin/sales-map")
  let salesMap: SalesMapData | null = null
  let listError: string | null = null

  try {
    salesMap = await getSalesMap()
  } catch (error) {
    listError = error instanceof Error ? error.message : "failed_to_fetch_admin_sales_prospect_status"
  }

  return (
    <SalesMapClient
      subjects={salesMap?.subjects ?? []}
      prospects={salesMap?.prospects ?? []}
      listError={listError}
      updateAction={updateSalesProspectStatusAction}
    />
  )
}
