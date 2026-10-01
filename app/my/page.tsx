import { withParentChild } from "@/features/classes/lib/parent-navigation"
import { unstable_noStore as noStore } from "next/cache"
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { MyHub } from "@/features/my/ui/my-hub"
import { getMyParentProfileDetail } from "@/features/my/queries/get-my-parent-profile-detail"
import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { MyRetry } from "@/features/my/ui/my-retry"
import styles from "./page.module.css"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import { ParentAccountDeletion } from "@/features/my/ui/parent-account-deletion"
import { MyFrame } from "./my-frame"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyPage({ searchParams }: { searchParams: Promise<{ edit?: string; child?: string }> }) {
  noStore()
  const params = await searchParams
  const returnTo = withParentChild(params.edit === "profile" ? "/my?edit=profile" : "/my", typeof params.child === "string" ? params.child : null)
  if (await isMyParentAccountDeletionPending()) return <MyFrame><ParentAccountDeletion recovery /></MyFrame>
  await requireParentAccess({ returnTo })
  const [profile, children, auth] = await Promise.all([
    getMyParentProfileDetail(), getMyChildren(), resolveCurrentAuth(returnTo)
  ])
  if (profile.error || !profile.data) return <MyFrame>
    <section className={styles.state} role="alert">
      <h2 className={styles.stateTitle}>내 정보를 불러오지 못했어요.</h2>
      <p className={styles.stateText}>잠시 후 다시 시도해 주세요.</p>
      <MyRetry />
    </section>
  </MyFrame>
  return <MyFrame>
    <MyHub
      profile={profile.data}
      email={auth.user?.email ?? null}
      childrenCount={children.error ? null : children.data.length}
      childrenError={children.error}
    />
    <ParentFooter showLegalLinks={false} designVersion="v1" />
  </MyFrame>
}
