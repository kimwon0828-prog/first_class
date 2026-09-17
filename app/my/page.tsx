import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyDashboard } from "@/features/my/queries/get-my-dashboard"
import { MyHub } from "@/features/my/ui/my-hub"

import styles from "./page.module.css"

/*
 * 마이페이지.
 *
 * ⚠️ dashboard 가 아니라 메뉴 Hub 다. 다가오는 일정 · 진행 중 경험은
 *    /my/schedule 과 /record 라는 top-level 탭이 이미 맡는다 —
 *    같은 것을 여기서 다시 강조하지 않는다.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyPage() {
  noStore()
  const profile = await requireParentAccess({ returnTo: "/my" })
  const { data, error } = await getMyDashboard()

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.content}>
          {error ? (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <p className={styles.dangerText}>{error}</p>
              <Link href="/my/profile" className={styles.link}>
                내 정보 확인하기
              </Link>
            </section>
          ) : (
            <MyHub
              profileName={profile.name}
              profilePhone={profile.phone}
              childrenCount={data.childrenCount}
            />
          )}

          {/*
            약관 · 개인정보처리방침 · 제3자 제공 동의 · 사업자 정보.

            Home 과 Search 는 앱 shell 화면이라 본문을 이것들로 채우지 않는다.
            학부모 화면에서 이 링크들이 사는 자리는 여기 하나다.
          */}
          <ParentFooter />
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
