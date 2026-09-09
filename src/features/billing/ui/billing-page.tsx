import Link from "next/link"

import { StartStandardButton } from "@/features/billing/ui/start-standard-button"
import { SubscriptionActions } from "@/features/billing/ui/subscription-actions"
import {
  formatBillingAmount,
  formatBillingDate,
  formatPaymentStatus
} from "@/features/billing/lib/subscription-presentation"
import type { StudioBillingOverview } from "@/features/billing/queries/get-studio-billing-overview"
import styles from "./billing-page.module.css"

// 구독/결제 화면. STUDIO_DESIGN_SYSTEM.md §3.10 Billing Page 패턴.
//
//   Page Header → Status Alert(조건부)
//   → Pricing Grid → Feature Comparison        (상품 이해)
//   → Billing Management → Payment History     (계약 관리)
//
// 현재 쓰는 플랜은 요금제 카드의 CTA 자리에서 말한다. "현재 플랜" 전용 카드를 두지 않는다.
// 판매하지 않는 플랜(프로)은 모델에도 DOM 에도 없다.

type BillingPageProps = {
  overview: StudioBillingOverview
  notice: string | null
}

export const BillingPage = ({ overview, notice }: BillingPageProps) => {
  const { presentation, billingMethod, payments, pricingCards, featureComparison, nextBilling } =
    overview

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>구독 및 결제</h1>
        <p className={styles.description}>첫수업 스튜디오의 플랜과 결제 정보를 관리해요.</p>
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

      <section aria-labelledby="pricing-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="pricing-title">
            나에게 맞는 플랜을 선택하세요
          </h2>
          <p className={styles.sectionDescription}>
            체험 운영은 무료로 시작하고, 상담과 등록 전환 관리가 필요할 때 스탠다드로 확장하세요.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {pricingCards.map((card) => (
            <article
              key={card.planCode}
              className={`${styles.planCard} ${card.featured ? styles.planCardFeatured : ""}`}
              aria-labelledby={`plan-${card.planCode}`}
            >
              <div className={styles.planHead}>
                <h3 className={styles.planName} id={`plan-${card.planCode}`}>
                  {card.name}
                </h3>
                <span className={styles.planSubName}>{card.subName}</span>
                {card.featured ? <span className={styles.recommendBadge}>추천</span> : null}
              </div>

              <p className={styles.planPrice}>
                {card.priceLabel}
                {card.priceUnit ? <span className={styles.planPriceUnit}> {card.priceUnit}</span> : null}
              </p>

              <p className={styles.planDescription}>{card.description}</p>

              <ul className={styles.benefits}>
                {card.benefits.map((benefit) => (
                  <li key={benefit} className={styles.benefit}>
                    {benefit}
                  </li>
                ))}
              </ul>

              <div className={styles.planCta}>
                {card.cta.kind === "action" ? (
                  <StartStandardButton />
                ) : card.cta.kind === "disabled" ? (
                  <>
                    <button type="button" className={styles.ctaDisabled} disabled>
                      {card.cta.label}
                    </button>
                    {card.cta.note ? <p className={styles.ctaNote}>{card.cta.note}</p> : null}
                  </>
                ) : (
                  <p className={styles.ctaStatic}>{card.cta.label}</p>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* 결제 조건의 canonical 문서. 공개 페이지와 같은 URL 을 쓴다. */}
        <p className={styles.policyNote}>
          스탠다드 결제 조건은{" "}
          <Link href="/refund-policy" className={styles.policyLink}>
            환불 및 해지 정책
          </Link>
          에서 확인할 수 있어요.
        </p>

        {presentation.hasInternalFullAccess ? (
          <p className={styles.internalNote}>
            <span className={styles.internalNoteMark} aria-hidden="true">
              ⓘ
            </span>
            <span>내부 테스트 권한으로 전체 기능을 이용 중이에요. 결제 상태와는 별개예요.</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="comparison-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="comparison-title">
            요금제별 기능 비교
          </h2>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.featureLabel}>
                  기능
                </th>
                <th scope="col">무료</th>
                <th scope="col" className={styles.standardColumn}>
                  스탠다드
                </th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={styles.featureLabel}>
                    {row.label}
                  </th>
                  <td>
                    <FeatureMark included={row.free} />
                  </td>
                  <td className={styles.standardColumn}>
                    <FeatureMark included={row.standard} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="management-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="management-title">
            결제 관리
          </h2>
        </div>

        <div className={styles.managementGrid}>
          <article className={styles.factCard} aria-labelledby="billing-method-title">
            <h3 className={styles.factTitle} id="billing-method-title">
              결제수단
            </h3>
            {billingMethod ? (
              <p className={styles.factValue}>
                {billingMethod.issuerName ? `${billingMethod.issuerName} ` : ""}
                {billingMethod.maskedNumber ?? "카드 정보 없음"}
              </p>
            ) : (
              <p className={styles.empty}>등록된 결제수단이 없어요.</p>
            )}
          </article>

          <article className={styles.factCard} aria-labelledby="next-billing-title">
            <h3 className={styles.factTitle} id="next-billing-title">
              {nextBilling.title}
            </h3>
            {nextBilling.value ? (
              <>
                <p className={styles.factValue}>{nextBilling.value}</p>
                {nextBilling.caption ? (
                  <p className={styles.factCaption}>{nextBilling.caption}</p>
                ) : null}
                <span className={`${styles.badge} ${styles[presentation.statusBadge.tone]}`}>
                  {presentation.statusBadge.label}
                </span>
              </>
            ) : (
              <p className={styles.empty}>{nextBilling.emptyText}</p>
            )}
          </article>
        </div>

        <SubscriptionActions
          canCancel={presentation.canCancel}
          canResume={presentation.canResume}
          endDate={presentation.dateRow?.value ?? null}
        />
      </section>

      <section aria-labelledby="payment-history-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="payment-history-title">
            결제 내역
          </h2>
        </div>

        {payments.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.historyTable}>
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
          <p className={styles.emptyRow}>아직 결제 내역이 없어요.</p>
        )}
      </section>
    </div>
  )
}

/** 아이콘만으로 의미를 전달하지 않는다. 읽히는 텍스트를 함께 둔다. */
const FeatureMark = ({ included }: { included: boolean }) =>
  included ? (
    <span className={styles.included}>
      <span aria-hidden="true">✓</span>
      <span className={styles.srOnly}>지원</span>
    </span>
  ) : (
    <span className={styles.excluded}>
      <span aria-hidden="true">—</span>
      <span className={styles.srOnly}>미지원</span>
    </span>
  )
