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
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { getHomeNotifications, hasHomeUnreadNotifications } from "@/features/notifications/queries/get-home-notifications"
import { getMyAcademyNewsConsentAction } from "@/features/marketing-consent/actions/set-academy-news-consent"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import { ParentAccountDeletion } from "@/features/my/ui/parent-account-deletion"
import { MyFrame } from "./my-frame"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyPage({ searchParams }: { searchParams: Promise<{ edit?: string; child?: string; delete?: string; appleDeletion?: string }> }) {
  noStore()
  const params = await searchParams
  if (params.delete === "1" && ["mismatch", "unavailable"].includes(params.appleDeletion ?? "")) return <MyFrame>
    <section className={styles.state} role="alert"><h2 className={ui.subtitle}>Apple 본인 확인을 완료하지 못했어요.</h2>
      <p className={ui.body}>{params.appleDeletion === "mismatch" ? "다른 Apple 계정으로 로그인되어 탈퇴를 중단했어요. 기존 계정의 데이터는 삭제하지 않았어요." : "탈퇴할 계정으로 다시 Apple 본인 확인을 해 주세요. 계정 데이터는 삭제하지 않았어요."}</p>
      <a href="/auth/sign-in?returnTo=%2Fmy" className={styles.stateLink}>로그인 다시 확인</a></section>
  </MyFrame>
  const returnTo = withParentChild(params.edit === "profile" ? "/my?edit=profile" : "/my", typeof params.child === "string" ? params.child : null)
  if (await isMyParentAccountDeletionPending()) return <MyFrame><ParentAccountDeletion recovery /></MyFrame>
  const parent = await requireParentAccess({ returnTo })
  if (params.delete === "1") return <MyFrame><ParentAccountDeletion /></MyFrame>
  const [profile, children, auth, notifications, consent] = await Promise.all([
    getMyParentProfileDetail(), getMyChildren(), resolveCurrentAuth(returnTo),
    getHomeNotifications(parent.id).catch(() => null), getMyAcademyNewsConsentAction()
  ])
  const unread = hasHomeUnreadNotifications(notifications)
  if (profile.error || !profile.data) return <MyFrame unread={unread}>
    <div className={ui.notice} role="alert">
      <p className={ui.body}>내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      <MyRetry />
    </div>
  </MyFrame>
  const provider = auth.user?.app_metadata?.provider
  return <MyFrame unread={unread}>
    <MyHub
      profile={profile.data}
      email={auth.user?.email ?? null}
      provider={typeof provider === "string" ? provider : null}
      kids={children.error ? null : children.data}
      childrenError={children.error}
      consent={consent.ok ? consent.data : null}
    />
    <ParentFooter showLegalLinks={false} designVersion="v1" />
  </MyFrame>
}
