import Link from "next/link"
import type { CSSProperties } from "react"

import { StartStandardButton } from "@/features/billing/ui/start-standard-button"
import { SubscriptionActions } from "@/features/billing/ui/subscription-actions"
import { TrialCardRegistration } from "@/features/billing/ui/trial-card-registration"
import {
  formatBillingAmount,
  formatBillingDate,
  formatPaymentStatus,
  type BillingBadgeTone
} from "@/features/billing/lib/subscription-presentation"
import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2CheckIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import type { StudioBillingOverview } from "@/features/billing/queries/get-studio-billing-overview"
import { describeTrialStatus } from "@/features/billing/lib/standard-trial"
import styles from "./billing-page.module.css"

// 설정 · 플랜·결제 (Figma 2148:7024). STUDIO_DESIGN_SYSTEM.md §5.23.
//
//   지금 상태 카드 → 플랜 카드 2장(무료 · 스탠다드) → 결제 수단 · 다음 결제 → 결제 내역 → 기능 비교
//
// 문구 · 가격 · 혜택 · 버튼 동작은 subscription-presentation 이 만든 값 그대로다(화면만 v2).
// 판매하지 않는 플랜(프로)은 모델에도 DOM 에도 없다.

type BillingPageProps = {
  overview: StudioBillingOverview
  notice: string | null
}

const BADGE_TONES: Record<BillingBadgeTone, StudioStatusTone> = { green: "green", blue: "blue", amber: "amber", gray: "gray" }

export const BillingPage = ({ overview, notice }: BillingPageProps) => {
  const { presentation, billingMethod, payments, pricingCards, featureComparison, nextBilling } =
    overview
  // 지금 쓰는 플랜(결제 사실 기준)의 이름 · 설명. 문구는 subscription-presentation 값 그대로다.
  const planName = presentation.planLabel.endsWith("플랜") ? presentation.planLabel : `${presentation.planLabel} 플랜`
  const currentCard = pricingCards.find((card) => card.planCode === presentation.billedPlanCode) ?? null
  const trial = presentation.trial
  // 카드 등록(§5.26)은 자동 체험 · 카드 전 · 창(종료 30일 전부터) 안 · 결제 가능한 배포에서만 연다.
  const canRegisterCard = Boolean(trial && trial.state === "no_card" && trial.cardWindowOpen && overview.billingAvailable)
  const amountLabel = formatBillingAmount(overview.standardAmount)

  return (
    <div className={styles.page}>
      {/*
        카드사 심사용 조직에서만 뜬다. overview.reviewMode 는 서버가 조직 UUID 를
        TOSS_REVIEW_ORGANIZATION_ID 와 대조해 정한 값이라, 일반 학원에서는 항상 false 다.
        심사 담당자가 실제 청구로 오해하지 않도록 TEST 환경임을 밝혀 둔다.
      */}
      {overview.reviewMode ? (
        <p className={styles.reviewNotice} role="note">
          카드사 심사용 테스트 계정입니다. 이 계정의 결제는 Toss Payments 테스트 환경에서
          처리되며 실제 청구가 발생하지 않습니다.
        </p>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {/* 자동 체험(Figma 2148:7041): 배지 대신 "N일 남음", 설명 아래 진행 막대. */}
      {trial ? (
        <section className={styles.statusCard} aria-labelledby="billing-status-title">
          <div className={styles.statusHead}>
            <h2 className={styles.statusTitle} id="billing-status-title">지금은 스탠다드 무료 체험 중이에요</h2>
            <span className={styles.trialDays}>{trial.daysLeft}일 남음</span>
          </div>
          <p className={styles.statusBody}>{describeTrialStatus(trial, overview.standardAmount)}</p>
          {trial.elapsedRatio !== null ? (
            <span className={styles.trialBar} aria-hidden="true">
              <span
                className={styles.trialBarFill}
                style={{ "--trial-elapsed": `${Math.round(trial.elapsedRatio * 100)}%` } as CSSProperties}
              />
            </span>
          ) : null}
          {presentation.hasInternalFullAccess ? (
            <p className={styles.internalNote}>내부 테스트 권한으로 전체 기능을 이용 중이에요. 결제 상태와는 별개예요.</p>
          ) : null}
        </section>
      ) : (
      /* 지금 상태: 유예 · 결제 실패 같은 안내(alert)가 있으면 그것을, 없으면 지금 플랜과 날짜를 말한다. */
      <section className={presentation.alert ? `${styles.statusCard} ${styles.statusCardAlert}` : styles.statusCard} aria-labelledby="billing-status-title">
        <div className={styles.statusHead}>
          <h2 className={styles.statusTitle} id="billing-status-title">
            {presentation.alert ? presentation.alert.title : `지금은 ${planName}을 쓰고 있어요`}
          </h2>
          <V2StatusBadge tone={BADGE_TONES[presentation.statusBadge.tone]}>{presentation.statusBadge.label}</V2StatusBadge>
        </div>
        <p className={styles.statusBody}>
          {presentation.alert
            ? presentation.alert.body
            : presentation.dateRow
              ? `${presentation.dateRow.label} ${presentation.dateRow.value}`
              : currentCard?.description ?? ""}
        </p>
        {presentation.hasInternalFullAccess ? (
          <p className={styles.internalNote}>내부 테스트 권한으로 전체 기능을 이용 중이에요. 결제 상태와는 별개예요.</p>
        ) : null}
      </section>
      )}

      <section className={styles.planGrid} aria-label="플랜">
        {pricingCards.map((card) => (
          <article
            key={card.planCode}
            className={card.featured ? `${styles.planCard} ${styles.planCardFeatured}` : styles.planCard}
            aria-labelledby={`plan-${card.planCode}`}
          >
            <div className={styles.planHead}>
              <h3 className={styles.planName} id={`plan-${card.planCode}`}>{card.name}</h3>
              <span className={styles.planSubName}>{card.subName}</span>
              <span className={styles.spacer} />
              {card.featured ? <V2StatusBadge tone="green">추천</V2StatusBadge> : null}
            </div>
            <p className={styles.planPrice}>
              {card.priceLabel}
              {card.priceUnit ? <span className={styles.planPriceUnit}>{card.priceUnit}</span> : null}
            </p>
            <p className={styles.planDescription}>{card.description}</p>
            <ul className={styles.benefits}>
              {card.benefits.map((benefit) => (
                <li key={benefit}>
                  <V2CheckIcon size={18} className={styles.benefitIcon} />
                  {benefit}
                </li>
              ))}
            </ul>
            <div className={styles.planCta}>
              {card.cta.kind === "action" ? (
                <StartStandardButton />
              ) : card.cta.kind === "register_card" && trial ? (
                <TrialCardRegistration placement="plan" label={card.cta.label} lastDayLabel={trial.lastDayLabel} amountLabel={amountLabel} />
              ) : card.cta.kind === "disabled" || card.cta.kind === "register_card" ? (
                <>
                  <button type="button" className={v2ButtonClassName({ variant: "outline", size: "lg", className: styles.ctaFull })} disabled>
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
      </section>

      {/* 결제 조건의 canonical 문서. 공개 페이지와 같은 URL 을 쓴다. */}
      <p className={styles.policyNote}>
        스탠다드 결제 조건은{" "}
        <Link href="/refund-policy" className={styles.policyLink}>
          환불 및 해지 정책
        </Link>
        에서 확인할 수 있어요.
      </p>

      <section className={styles.factBox} aria-label="결제 관리">
        <div className={styles.factRow}>
          <div className={styles.factText}>
            <h3>결제 수단</h3>
            <p>
              {billingMethod
                ? `${billingMethod.issuerName ? `${billingMethod.issuerName} ` : ""}${billingMethod.maskedNumber ?? "카드 정보 없음"}`
                : trial
                  ? trial.cardWindowOpen
                    ? "아직 등록하지 않았어요 · 체험이 끝나기 전에 알려드릴게요"
                    : `아직 등록하지 않았어요 · ${trial.cardWindowStartLabel}부터 카드를 등록할 수 있어요`
                  : "등록된 결제수단이 없어요."}
            </p>
          </div>
          {canRegisterCard && trial ? (
            <TrialCardRegistration placement="payment" label="카드 등록" lastDayLabel={trial.lastDayLabel} amountLabel={amountLabel} />
          ) : null}
        </div>
        <div className={styles.factRow}>
          <div className={styles.factText}>
            <h3>{nextBilling.title}</h3>
            <p>
              {nextBilling.value
                ? [nextBilling.value, nextBilling.caption].filter(Boolean).join(" · ")
                : nextBilling.emptyText}
            </p>
          </div>
          <SubscriptionActions
            canCancel={presentation.canCancel}
            canResume={presentation.canResume}
            endDate={presentation.dateRow?.value ?? null}
            variant={trial ? "trial" : "subscription"}
          />
        </div>
      </section>

      {/* Figma 2148:7112. 리포트 보내기는 2차-1부터 모든 플랜에서 무료다(AGENTS.md 요금제 정책). */}
      <p className={styles.notice}>리포트 보내기는 모든 플랜에서 무료예요. 학부모가 리포트를 보고 등록을 결정하기 때문이에요.</p>

      <section className={styles.section} aria-labelledby="payment-history-title">
        <h2 className={styles.sectionTitle} id="payment-history-title">결제 내역</h2>
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

      <section className={styles.section} aria-labelledby="comparison-title">
        <h2 className={styles.sectionTitle} id="comparison-title">요금제별 기능 비교</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">기능</th>
                <th scope="col" className={styles.markCell}>무료</th>
                <th scope="col" className={styles.markCell}>스탠다드</th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={styles.markCell}><FeatureMark included={row.free} /></td>
                  <td className={styles.markCell}><FeatureMark included={row.standard} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/** 아이콘만으로 의미를 전달하지 않는다. 읽히는 텍스트를 함께 둔다. */
const FeatureMark = ({ included }: { included: boolean }) =>
  included ? (
    <span className={styles.included}>
      <V2CheckIcon size={18} />
      <span className={styles.srOnly}>지원</span>
    </span>
  ) : (
    <span className={styles.excluded}>
      <span aria-hidden="true">—</span>
      <span className={styles.srOnly}>미지원</span>
    </span>
  )
