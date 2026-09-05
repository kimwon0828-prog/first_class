import type { ConversionInfographicModel } from "@/features/reports/lib/conversion-infographic-model"

import styles from "./conversion-infographic.module.css"

// 미리보기와 다운로드가 같은 컴포넌트를 쓴다. 두 벌로 만들지 않는다.
//
// 색만으로 뜻을 전하지 않는다 — 모든 구간에 숫자 라벨을 함께 둔다.

const DECISION_SEGMENT_CLASS: Record<string, string> = {
  enrolled: styles.decisionEnrolled,
  pending: styles.decisionPending,
  not_enrolled: styles.decisionNotEnrolled
}

type ConversionInfographicProps = {
  model: ConversionInfographicModel
  /** 캡처 대상 DOM. 부모가 ref 를 붙여 원본 크기 그대로 저장한다. */
  captureRef?: React.Ref<HTMLDivElement>
}

export const ConversionInfographic = ({ model, captureRef }: ConversionInfographicProps) => (
  <div className={styles.report} ref={captureRef}>
    <div className={styles.brandRow}>
      <span className={styles.wordmark}>첫수업</span>
      <span className={styles.reportKind}>등록전환 리포트</span>
    </div>

    <h1 className={styles.headline}>{model.organizationName}</h1>
    <p className={styles.periodLine}>{model.periodLabel}</p>

    <section className={styles.kpiCard} aria-label="등록 전환율">
      <p className={styles.kpiLabel}>등록 전환율</p>
      <p className={styles.kpiValue}>{model.conversionRateLabel}</p>
      <p className={styles.kpiMeta}>{model.conversionMeta}</p>
    </section>

    <h2 className={styles.sectionTitle}>신청부터 등록까지</h2>
    <ul className={styles.funnelList}>
      {model.funnel.map((step, index) => (
        <li key={step.key} className={styles.funnelRow}>
          <span className={styles.funnelLabel}>{step.label}</span>
          <span className={styles.funnelTrack}>
            <span
              className={`${styles.funnelFill} ${
                index === model.funnel.length - 1 ? styles.funnelFillLast : ""
              }`}
              style={{ width: `${step.visualFillPercent}%` }}
            />
          </span>
          <span className={styles.funnelCount}>{step.count}</span>
        </li>
      ))}
    </ul>

    <h2 className={styles.sectionTitle}>체험 완료 후 결정</h2>
    <div className={styles.decisionBar} aria-hidden="true">
      {model.decisions.map((segment) => (
        <span
          key={segment.key}
          className={`${styles.decisionSegment} ${DECISION_SEGMENT_CLASS[segment.key]}`}
          style={{ width: `${segment.visualSharePercent}%` }}
        />
      ))}
    </div>
    <ul className={styles.decisionLegend}>
      {model.decisions.map((segment) => (
        <li key={segment.key} className={styles.decisionItem}>
          <span
            className={`${styles.decisionDot} ${DECISION_SEGMENT_CLASS[segment.key]}`}
            aria-hidden="true"
          />
          {segment.label}
          <strong className={styles.decisionValue}>{segment.count}</strong>
        </li>
      ))}
    </ul>

    {model.topUnregisteredReasons.length > 0 ? (
      <>
        <h2 className={styles.sectionTitle}>미등록 주요 사유</h2>
        <ul className={styles.reasonList}>
          {model.topUnregisteredReasons.map((reason) => (
            <li key={reason.key} className={styles.reasonRow}>
              <span className={styles.reasonLabel}>{reason.label}</span>
              <span className={styles.reasonTrack}>
                <span
                  className={styles.reasonFill}
                  style={{ width: `${reason.visualFillPercent}%` }}
                />
              </span>
              <span className={styles.reasonCount}>{reason.count}</span>
            </li>
          ))}
        </ul>
      </>
    ) : null}

    <div className={styles.footer}>
      <p className={styles.footnote}>{model.applicationFootnote}</p>
      <p className={styles.generatedAt}>생성일 {model.generatedDateLabel}</p>
    </div>
  </div>
)
