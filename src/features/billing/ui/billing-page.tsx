import { StartStandardButton } from "@/features/billing/ui/start-standard-button"
import type { ResolvedStudioEntitlements } from "@/features/billing/lib/entitlements"
import styles from "./billing-page.module.css"

// 결제 진입 화면(최소).
//
// Settings / Form Page 패턴(§3.9)을 그대로 쓴다. 플랜 카드·결제 내역·해지·카드 변경 UX 는
// BILLING-4 이며, 그 화면들은 디자인 시스템에 패턴이 추가된 뒤에 만든다.

type BillingPageProps = {
  resolved: ResolvedStudioEntitlements
  tossReady: boolean
  notice: string | null
}

const PLAN_LABEL: Record<string, string> = {
  free: "무료",
  standard: "스탠다드",
  pro: "프로"
}

export const BillingPage = ({ resolved, tossReady, notice }: BillingPageProps) => {
  const isPaid = resolved.billedPlanCode !== "free"

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>결제</h1>
        <p className={styles.description}>
          스탠다드는 체험 결과 · 상담 · 등록 전환 · 전환 분석을 사용할 수 있습니다.
        </p>
      </header>

      {notice ? <p className={styles.notice}>{notice}</p> : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>현재 플랜</h2>
        <p className={styles.planValue}>{PLAN_LABEL[resolved.billedPlanCode] ?? "무료"}</p>
        {resolved.hasInternalFullAccess ? (
          <p className={styles.hint}>내부 전체 권한으로 기능이 열려 있습니다. 결제와는 별개입니다.</p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>스탠다드</h2>
        <p className={styles.price}>월 49,000원</p>
        {isPaid ? (
          <p className={styles.hint}>이미 이용 중입니다.</p>
        ) : tossReady ? (
          <StartStandardButton />
        ) : (
          <p className={styles.hint}>결제 준비가 아직 완료되지 않았습니다.</p>
        )}
      </section>
    </div>
  )
}
