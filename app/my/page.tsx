import { unstable_noStore as noStore } from "next/cache"
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { MyHub } from "@/features/my/ui/my-hub"
import { MyFrame } from "./my-frame"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyPage() {
  noStore()
  const profile = await requireParentAccess({ returnTo: "/my" })
  const children = await getMyChildren()
  return <MyFrame>
    <MyHub
      profileName={profile.name}
      profilePhone={profile.phone}
      childrenCount={children.error ? null : children.data.length}
      childrenError={children.error}
    />
    <ParentFooter showLegalLinks={false} designVersion="v1" />
  </MyFrame>
}
