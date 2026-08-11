import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyParentProfileDetail } from "@/features/my/queries/get-my-parent-profile-detail"
import { ParentProfileForm } from "@/features/my/ui/parent-profile-form"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyProfilePage() {
  noStore()
  const profile = await requireParentAccess({ returnTo: "/my/profile" })
  const { data: parentProfile, error } = await getMyParentProfileDetail()
  const resolvedParentProfile = parentProfile ?? {
    id: profile.id,
    name: profile.name,
    phone: profile.phone,
    parentBirthDate: null
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/my" className={styles.backButton} aria-label="뒤로가기">
            ←
          </Link>
          <h1 className={styles.title}>내 정보 수정</h1>
          <span aria-hidden="true" />
        </header>

        <div className={styles.content}>
          <p className={styles.intro}>카카오 로그인으로 가입한 경우 생년월일이 비어 있을 수 있습니다.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <ParentProfileForm
            initialName={resolvedParentProfile.name}
            initialPhone={resolvedParentProfile.phone}
            initialParentBirthDate={resolvedParentProfile.parentBirthDate}
          />
        </div>
      </div>
    </main>
  )
}
