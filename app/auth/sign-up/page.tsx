import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

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

  const signInHref = returnTo ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/auth/sign-in"

  return (
    <main
      style={{
        background: "#ffffff",
        width: "100%",
        minHeight: "100dvh",
        overflowX: "hidden"
      }}
    >
      <div
        style={{
          background: "#ffffff",
          margin: "0 auto",
        width: "100%",
        maxWidth: 430,
        minHeight: "100dvh",
        boxSizing: "border-box",
          overflowX: "hidden",
          padding:
            "calc(14px + env(safe-area-inset-top)) 24px calc(110px + env(safe-area-inset-bottom))"
      }}
    >
        <header style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", minHeight: 44 }}>
            <Link
              href={signInHref}
              aria-label="뒤로가기"
              style={{
                width: 44,
                height: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                textDecoration: "none",
                color: "#111111",
                WebkitTapHighlightColor: "transparent"
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <h1
              style={{
                margin: 0,
                marginLeft: 6,
                fontSize: 26,
                lineHeight: 1.25,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: "#111111"
              }}
            >
              회원가입
            </h1>
          </div>
        </header>

        <section style={{ marginTop: 28 }}>
          <Image
            src="/images/first-class-logo.png"
            alt="첫수업"
            width={93}
            height={30}
            priority
            style={{ display: "block" }}
          />
          <p
            style={{
              margin: "18px 0 0",
              fontSize: 24,
              lineHeight: 1.35,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#111111"
            }}
          >
            첫수업에서
            <br />
            우리 아이에게 맞는 수업을 찾아보세요.
          </p>
        </section>

        <div style={{ marginTop: 32 }}>
          <SignUpForm returnTo={returnTo ?? undefined} />
        </div>
      </div>
    </main>
  )
}
