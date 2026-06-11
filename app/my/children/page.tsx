import { MyChildrenClient } from "@/features/children/ui/my-children-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function MyChildrenPage() {
  return <MyChildrenClient />
}
