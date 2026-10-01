import Link from "next/link"
import { cookies } from "next/headers"
import { ParentDeletionBrowserCleanup } from "@/features/my/ui/parent-deletion-browser-cleanup"
import styles from "../my/page.module.css"

export default async function AccountDeletedPage({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const params = await searchParams
  const completed = (await cookies()).get("parent-account-deleted")?.value === "1"
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <section className={styles.state} style={{ marginTop: 32 }}>
      <h1 className={styles.stateTitle}>회원탈퇴가 완료되었습니다.</h1>
      <p className={styles.stateText}>첫수업을 이용해 주셔서 감사합니다.</p>
      {completed ? <ParentDeletionBrowserCleanup /> : null}
      {params.local === "blocked" ? <p className={styles.stateText}>브라우저 저장소 접근이 차단되어 관심수업을 정리하지 못했습니다. 이 브라우저의 첫수업 사이트 데이터를 삭제해 주세요.</p> : null}
      <Link href="/">홈으로</Link>
    </section>
  </div></main>
}
