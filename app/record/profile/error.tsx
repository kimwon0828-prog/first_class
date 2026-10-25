"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { EducationProfileFrame, EducationProfileSkeleton } from "./profile-frame"

function ProfileErrorContent() {
  const params = useSearchParams()
  return <EducationProfileFrame childId={params.get("child")}><div className={ui.notice} role="alert">
    <p className={ui.body}>교육 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" onClick={() => window.location.reload()}>다시 시도</AppButton>
  </div></EducationProfileFrame>
}
export default function ErrorState() {
  return <Suspense fallback={<EducationProfileFrame><EducationProfileSkeleton /></EducationProfileFrame>}><ProfileErrorContent /></Suspense>
}
