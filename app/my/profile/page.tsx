import { redirect } from "next/navigation"

// Preserve historical links while keeping account editing inside MyPage.
export default function MyProfilePage() {
  redirect("/my?edit=profile")
}
