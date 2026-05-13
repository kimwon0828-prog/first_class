import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSession } from "@/features/auth/lib/session"
import { SignUpForm } from "@/features/auth/ui/sign-up-form"

type SignUpPageProps = {
  searchParams?: Promise<{
    returnTo?: string
  }>
}

const resolveSafeReturnTo = (raw: string | undefined): string | null => {
  const value = (raw ?? "").trim()
  if (!value) {
    return null
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null
  }

  return value
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const returnTo = resolveSafeReturnTo(resolvedSearchParams?.returnTo)
  const session = await getSession()
  if (session) {
    const profile = await getMyProfile()
    if (profile) {
      redirect(returnTo ?? resolvePostAuthRedirect(profile.role))
    }
    redirect("/classes")
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px" }}>
      <h1 style={{ marginTop: 0 }}>학부모 회원가입</h1>
      <p style={{ marginTop: 0, color: "#4b5563", fontSize: 14 }}>
        공개 회원가입은 학부모(parent) 계정만 가능합니다.
      </p>
      <SignUpForm returnTo={returnTo ?? undefined} />
    </main>
  )
}
