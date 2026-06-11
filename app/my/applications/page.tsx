import { MyApplicationsClient } from "@/features/applications/ui/my-applications-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function MyApplicationsPage() {
  return <MyApplicationsClient />
}
