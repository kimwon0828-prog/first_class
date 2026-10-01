import { redirect } from "next/navigation"
import { withParentChild } from "@/features/classes/lib/parent-navigation"

// Historical entry continues to open the approved MyPage sheet.
export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const { child } = await searchParams
  redirect(withParentChild("/my?edit=profile", typeof child === "string" ? child : null))
}
