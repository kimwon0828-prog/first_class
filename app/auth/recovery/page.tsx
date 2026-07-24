import { RecoveryConfirmClient } from "./recovery-confirm-client"

type RecoveryPageProps = {
  searchParams?: Promise<{
    type?: string
  }>
}

export default async function RecoveryPage({ searchParams }: RecoveryPageProps) {
  const resolved = searchParams ? await searchParams : undefined
  const userType = resolved?.type === "academy" ? "academy" : "parent"

  return <RecoveryConfirmClient userType={userType} />
}
