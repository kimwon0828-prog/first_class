import { StartStandardButton } from "@/features/billing/ui/start-standard-button"
import {
  formatBillingAmount,
  formatBillingDate,
  formatPaymentStatus
} from "@/features/billing/lib/subscription-presentation"
import type { StudioBillingOverview } from "@/features/billing/queries/get-studio-billing-overview"
import styles from "./billing-page.module.css"

// 구독/결제 화면. STUDIO_DESIGN_SYSTEM.md §3.10 Billing Page 패턴.
//
//   Page Header → Status Alert(조건부) → Current Plan → Plan Offer(무료만)
//   → Billing Method → Payment History
//
// 판매하지 않는 플랜(프로)은 이 화면에 존재하지 않는다.

type BillingPageProps = {
  overview: StudioBillingOverview
  notice: string | null
}

const STANDARD_BENEFITS = [
  "체험 결과와 상담 기록 작성",
  "등록 전환 분석",
  "등록 전환 인포그래픽 내려받기",
  "Marketplace 우선 노출"
]

export const BillingPage = ({ overview, notice }: BillingPageProps) => {
  const { presentation, billingMethod, payments, billingAvailable, standardAmount } = overview

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>구독 및 결제</h1>
        <p className={styles.description}>
          첫수업 스튜디오의 플랜과 결제 정보를 관리해요.
        </p>
      </header>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {presentation.alert ? (
        <section className={styles.alert} aria-labelledby="billing-alert-title">
          <h2 className={styles.alertTitle} id="billing-alert-title">
            {presentation.alert.title}
          </h2>
          <p className={styles.alertBody}>{presentation.alert.body}</p>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="current-plan-title">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle} id="current-plan-title">
            현재 플랜
          </h2>
          <span className={`${styles.badge} ${styles[presentation.statusBadge.tone]}`}>
            {presentation.statusBadge.label}
          </span>
        </div>

        <p className={styles.planName}>{presentation.planLabel}</p>

        <dl className={styles.factList}>
          {presentation.monthlyAmount !== null ? (
            <div className={styles.fact}>
              <dt className={styles.factLabel}>월 요금</dt>
              <dd className={styles.factValue}>{formatBillingAmount(presentation.monthlyAmount)}</dd>
            </div>
          ) : null}
          {presentation.dateRow ? (
            <div className={styles.fact}>
              <dt className={styles.factLabel}>{presentation.dateRow.label}</dt>
              <dd className={styles.factValue}>{presentation.dateRow.value}</dd>
            </div>
          ) : null}
        </dl>

        {presentation.hasInternalFullAccess ? (
          <p className={styles.hint}>
            내부 테스트 권한으로 전체 기능을 사용하고 있어요. 결제와는 별개예요.
          </p>
        ) : null}
      </section>

      {presentation.showStandardOffer ? (
        <section className={styles.card} aria-labelledby="standard-title">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle} id="standard-title">
              스탠다드
            </h2>
          </div>
          <p className={styles.price}>
            {formatBillingAmount(standardAmount)}
            <span className={styles.priceUnit}> / 월</span>
          </p>
          <ul className={styles.benefits}>
            {STANDARD_BENEFITS.map((benefit) => (
              <li key={benefit} className={styles.benefit}>
                {benefit}
              </li>
            ))}
          </ul>
          {billingAvailable ? (
            <StartStandardButton />
          ) : (
            <div className={styles.unavailable}>
              <button type="button" className={styles.primaryDisabled} disabled>
                스탠다드 시작하기
              </button>
              <p className={styles.hint}>결제 기능을 준비 중이에요.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="billing-method-title">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle} id="billing-method-title">
            결제수단
          </h2>
        </div>
        {billingMethod ? (
          <p className={styles.methodValue}>
            {billingMethod.issuerName ? `${billingMethod.issuerName} ` : ""}
            {billingMethod.maskedNumber ?? "카드 정보 없음"}
          </p>
        ) : (
          <p className={styles.empty}>등록된 결제수단이 없어요.</p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="payment-history-title">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle} id="payment-history-title">
            결제 내역
          </h2>
        </div>
        {payments.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">결제일</th>
                  <th scope="col">상품</th>
                  <th scope="col">금액</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatBillingDate(payment.occurredAt) ?? "-"}</td>
                    <td>스탠다드</td>
                    <td className={styles.amountCell}>{formatBillingAmount(payment.amount)}</td>
                    <td>{formatPaymentStatus(payment.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>아직 결제 내역이 없어요.</p>
        )}
      </section>
    </div>
  )
}
