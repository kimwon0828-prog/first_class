"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { EducationProfileFrame, EducationProfileSkeleton } from "./profile-frame"
import styles from "./page.module.css"

function ProfileErrorContent() {
  const params = useSearchParams()
  return <EducationProfileFrame childId={params.get("child")}><section className={styles.empty} role="alert">
    <h2>교육 프로필을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해주세요.</p>
    <button type="button" className={styles.retry} onClick={() => window.location.reload()}>다시 시도하기</button>
  </section></EducationProfileFrame>
}
export default function ErrorState() {
  return <Suspense fallback={<EducationProfileFrame><EducationProfileSkeleton /></EducationProfileFrame>}><ProfileErrorContent /></Suspense>
}
