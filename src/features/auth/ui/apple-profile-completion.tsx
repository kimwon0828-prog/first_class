"use client"

import { useRouter } from "next/navigation"
import { ParentProfileForm } from "@/features/my/ui/parent-profile-form"
import { completeAppleProfileAction } from "../actions/complete-apple-profile"
import { safeAuthReturnTo } from "../lib/apple-auth"

export function AppleProfileCompletion({ returnTo, verifiedPhone, initialName = "" }: { returnTo: string; verifiedPhone?: string | null; initialName?: string }) {
  const router = useRouter()
  return <ParentProfileForm initialName={initialName} initialPhone={verifiedPhone ?? null} phoneReadOnly={Boolean(verifiedPhone)} initialParentBirthDate={null}
    saveAction={completeAppleProfileAction} birthDateNote={verifiedPhone ? "생년월일은 선택사항입니다." : "연락처와 생년월일은 선택사항입니다."} onSaved={() => { router.replace(safeAuthReturnTo(returnTo)); router.refresh() }} />
}
