import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioSignInForm } from "@/features/studio/ui/studio-sign-in-form"
import { V2SubjectIcon3D } from "@/features/studio/ui/v2/v2-subject-icon-3d"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"
import { getRequestHostname } from "@/shared/lib/request-host"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"
import styles from "./page.module.css"

/* Figma 로그인 브랜드 칸의 과목 원 6개(수학 · 영어 · 코딩 · 과학 · 음악 · 미술). */
const BRAND_SUBJECTS = ["math", "english", "coding_it_robotics", "science", "music", "art_design"]

type StudioSignInPageProps = {
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

export default async function StudioSignInPage({ searchParams }: StudioSignInPageProps) {
  const studioPath = await getStudioNavigationPathResolver()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const returnTo = resolveSafeReturnTo(resolvedSearchParams?.returnTo)
  const session = await getSession()

  if (session) {
    const profile = await getMyProfile()

    if (profile?.role === "academy" || profile?.role === "admin") {
      redirect(studioPath(returnTo ?? "/studio"))
    }

    /* 학부모 세션은 Parent origin 으로 내보낸다. 같은 host 로 보내면 되돌아온다. */
    redirect(getParentCrossProductHref({ pathname: "/classes", hostname: await getRequestHostname() }))
  }

  return (
    <main className={styles.page}>
      {/* 왼쪽 브랜드 칸 (Figma 2148:4724). 과목 원은 장식이라 화면 읽기에서 뺀다. */}
      <section className={styles.brand} aria-label="첫수업 파트너 센터">
        <StudioHomeLogo width={106} height={35} priority />
        <span className={styles.spacer} />
        <h1 className={styles.headline}>
          전화 상담 없이,
          <br />
          체험 예약부터 등록까지
        </h1>
        <p className={styles.subcopy}>
          학부모는 첫수업 앱에서 체험을 예약하고, 학원은 여기서 일정·기록·리포트·등록 결과까지 한 번에 관리해요.
        </p>
        <div className={styles.subjects} aria-hidden="true">
          {BRAND_SUBJECTS.map((code) => <span key={code} className={styles.subject}><V2SubjectIcon3D categoryCode={code} size={40} /></span>)}
        </div>
        <span className={styles.spacer} />
        <p className={styles.copyright}>© 첫수업</p>
      </section>

      <section className={styles.formArea} aria-labelledby="studio-sign-in-title">
        <div className={styles.form}>
          <h2 id="studio-sign-in-title" className={styles.title}>파트너 센터 로그인</h2>
          <p className={styles.description}>학원 계정으로 로그인해 주세요.</p>
          <StudioSignInForm returnTo={returnTo ?? undefined} />
        </div>
      </section>
    </main>
  )
}
