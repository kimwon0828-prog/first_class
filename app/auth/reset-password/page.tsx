import { Suspense } from "react"

import { ResetPasswordClient } from "./reset-password-client"

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    type?: string
  }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resolved = searchParams ? await searchParams : undefined
  const type = resolved?.type === "academy" ? "academy" : "parent"

  return (
    <Suspense>
      <ResetPasswordClient userType={type} />
    </Suspense>
  )
}
