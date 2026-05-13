import Link from "next/link"
import { redirect } from "next/navigation"

import { signOutAction } from "@/features/auth/actions/sign-out"
import { getSession } from "@/features/auth/lib/session"

type AuthEntryButtonProps = {
  returnTo: string
}

export const AuthEntryButton = async ({ returnTo }: AuthEntryButtonProps) => {
  const session = await getSession()

  if (!session) {
    const searchParams = new URLSearchParams({
      returnTo
    })

    return (
      <Link
        href={`/auth/sign-in?${searchParams.toString()}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          backgroundColor: "#ffffff",
          color: "#111827",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 500
        }}
      >
        로그인
      </Link>
    )
  }

  const handleSignOut = async () => {
    "use server"

    await signOutAction()
    redirect("/classes")
  }

  return (
    <form action={handleSignOut}>
      <button
        type="submit"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #111827",
          backgroundColor: "#111827",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 500
        }}
      >
        로그아웃
      </button>
    </form>
  )
}
