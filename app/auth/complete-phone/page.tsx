import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getProfileForUser } from "@/features/auth/lib/profile-sync"
import { appleProfileCompletionHref, hasAppleIdentity, isStudioSignup } from "@/features/auth/lib/apple-auth"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getApplePhoneState } from "@/features/auth/phone/gate"
import { phoneReturnTo } from "@/features/auth/phone/contracts"
import { otpConfigurationReady } from "@/features/auth/phone/otp"
import { PhoneVerification } from "@/features/auth/ui/phone-verification"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import styles from "../account-conflict/page.module.css"
export default async function CompletePhonePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const next = phoneReturnTo((await searchParams).returnTo)
  const db = await getSupabaseServerClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect(`/auth/sign-in?returnTo=${encodeURIComponent(next)}`)
  if (await isMyParentAccountDeletionPending()) redirect("/my")
  const profile = await getProfileForUser(user)
  if (profile.status === "ok" && profile.profile.role !== "parent") redirect(resolvePostAuthRedirect(profile.profile.role))
  if (!hasAppleIdentity(user) || isStudioSignup(user) || profile.status === "unsupported_role") redirect("/auth/account-conflict?reason=account_check_failed")
  const state = await getApplePhoneState(user)
  if (!state.required) redirect(profile.status === "missing" ? appleProfileCompletionHref(next) : next)
  if (state.verified) redirect(state.profileMissing ? appleProfileCompletionHref(next) : next)
  const { data: resume } = state.unavailable ? { data: null } : await db.rpc("get_my_parent_phone_challenge")
  return <main className={styles.page}><section className={styles.card} style={{ wordBreak: "keep-all" }}>
    <h1 className={styles.title}>휴대폰 번호를 인증해주세요</h1>
    <p className={styles.message}>체험수업 신청과 일정 안내에 사용할 보호자 연락처를 확인할게요.</p>
    <PhoneVerification returnTo={next} initialPhone={resume?.phone} initialChallenge={resume?.challengeId} retryAfter={resume?.retryAfter} unavailable={state.unavailable || !otpConfigurationReady()} />
    <form action="/auth/sign-out" method="post"><input type="hidden" name="returnTo" value={next} /><button className={styles.secondaryButton}>로그아웃</button></form>
  </section></main>
}
