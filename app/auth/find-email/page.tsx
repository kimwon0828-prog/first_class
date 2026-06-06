import { Suspense } from "react"

import { FindEmailClient } from "./find-email-client"

type FindEmailPageProps = {
  searchParams?: Promise<{
    type?: string
  }>
}

export default async function FindEmailPage({ searchParams }: FindEmailPageProps) {
  const resolved = searchParams ? await searchParams : undefined
  const type = resolved?.type === "academy" ? "academy" : "parent"

  return (
    <Suspense>
      <FindEmailClient initialUserType={type} />
    </Suspense>
  )
}
