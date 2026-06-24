import {
  approveAcademyUpdateRequestAction,
  rejectAcademyUpdateRequestAction
} from "@/features/admin/actions/review-academy-update-request"
import { requireAdmin } from "@/features/admin/lib/require-admin"
import {
  getAcademyUpdateRequests,
  type AcademyUpdateRequestView
} from "@/features/admin/queries/get-academy-update-requests"
import { AcademyUpdateRequestsClient } from "./academy-update-requests-client"

export default async function AdminAcademyUpdateRequestsPage({
  searchParams
}: {
  searchParams?: Promise<{
    error?: string
  }>
}) {
  await requireAdmin("/admin/academy-update-requests")
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const actionError = resolvedSearchParams?.error
  let requests: AcademyUpdateRequestView[] = []
  let listError: string | null = null

  try {
    requests = await getAcademyUpdateRequests()
  } catch (error) {
    listError = error instanceof Error ? error.message : "failed_to_fetch_academy_update_requests"
  }

  return (
    <AcademyUpdateRequestsClient
      requests={requests}
      actionError={actionError ?? null}
      listError={listError}
      approveAction={approveAcademyUpdateRequestAction}
      rejectAction={rejectAcademyUpdateRequestAction}
    />
  )
}
