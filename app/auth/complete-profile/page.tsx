
import { getApplePhoneState, needsPhoneVerification } from "@/features/auth/phone/gate"
import { completePhoneHref } from "@/features/auth/phone/contracts"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getProfileForUser } from "@/features/auth/lib/profile-sync"
import { hasAppleIdentity, isStudioSignup, safeAuthReturnTo } from "@/features/auth/lib/apple-auth"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { AppleProfileCompletion } from "@/features/auth/ui/apple-profile-completion"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import styles from "../account-conflict/page.module.css"

export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const params = await searchParams
  const safeNext = safeAuthReturnTo(params.returnTo)
  const next = safeNext.startsWith("/auth/") ? "/" : safeNext
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?returnTo=${encodeURIComponent(next)}`)
  if (await isMyParentAccountDeletionPending()) redirect("/my")
  const existing = await getProfileForUser(user)
  if (existing.status === "ok" && existing.profile.role !== "parent") redirect(resolvePostAuthRedirect(existing.profile.role))
  const phone = await getApplePhoneState(user)
  if (needsPhoneVerification(phone)) redirect(completePhoneHref(next))
  if (existing.status === "ok") redirect(existing.profile.role === "parent" ? next : resolvePostAuthRedirect(existing.profile.role))
  if (!hasAppleIdentity(user) || isStudioSignup(user)) redirect("/auth/account-conflict?reason=account_check_failed")
  const providedName = [user.user_metadata?.name, user.user_metadata?.full_name].find(value => typeof value === "string" && value.trim())
  return <main className={styles.page}><section className={styles.card}>
    <h1 className={styles.title}>보호자 정보를 입력해 주세요</h1>
    <p className={styles.message}>체험수업 신청에 사용할 보호자 정보를 확인해 주세요. 저장 후 이전 화면으로 돌아갑니다.</p>
    {existing.status === "missing" ? <AppleProfileCompletion returnTo={next} initialName={typeof providedName === "string" ? providedName.trim().slice(0, 30) : ""} verifiedPhone={phone.verified ? phone.phone : null} /> : <p role="alert">계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    <Link href={`/auth/sign-in?error=retry&returnTo=${encodeURIComponent(next)}`} className={styles.secondaryButton}>다시 로그인하기</Link>
  </section></main>
}
