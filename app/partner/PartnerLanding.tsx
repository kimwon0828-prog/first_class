import Image from "next/image"
import Link from "next/link"

import PartnerInquiryForm from "./PartnerInquiryForm"
import PartnerLossCalculator from "./PartnerLossCalculator"
import PersonPictogram from "./PersonPictogram"
import styles from "./partner-v2.module.css"
import { BILLING_GRACE_PERIOD_DAYS, BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { STANDARD_TRIAL_DAYS, TRIAL_CARD_WINDOW_DAYS } from "@/features/billing/lib/standard-trial"
import { COMPANY_ADDRESS, COMPANY_EMAIL_HREF, COMPANY_INFO } from "@/shared/config/company-info"
import { getStudioCrossProductHrefResolver } from "@/shared/lib/cross-product-navigation-server"

/*
  학원 소식 보내기(다시 연락 문자)가 열리면 true 로 바꾼다.
  false 인 동안 기능 섹션(학원 소식)에 "곧 열려요"가 붙는다.
*/
const ACADEMY_NEWS_OPEN = false

const IMAGE_DIR = "/images/partner/v2"

// 금액의 주인은 plan-catalog.ts 다. 부가세 포함 총액이라 "부가세 별도"를 붙이지 않는다.
const STANDARD_AMOUNT_TEXT = `${BILLING_PLANS.standard.amount.toLocaleString("ko-KR")}원`

const navItems = [
  { href: "#features", label: "기능" },
  { href: "#price", label: "요금" },
  { href: "#faq", label: "자주 묻는 질문" }
]

const stats = [
  {
    value: 66,
    headline: "10명 중 약 7명",
    description: ["체험 후 등록 여부를", "엑셀·카톡·기억으로 확인해요"],
    note: "CRM에서 확인한다는 곳은 34%"
  },
  {
    value: 32,
    headline: "10명 중 약 3명",
    description: ["최근 3개월 사이", "노쇼·참석 확인이 늦어졌어요"],
    note: "상담·레벨테스트 결과 누락도 26%"
  },
  {
    value: 45,
    headline: "10명 중 4~5명",
    description: ["가장 먼저 필요한 기능으로", "\"상담·레벨테스트 기록\"을 골랐어요"],
    note: "자동 알림·리마인드가 그다음"
  }
]

const pillars = [
  {
    icon: "icon-parent-booking.png",
    title: "학부모가 먼저 찾아와요",
    body: "학부모 앱에서 아이 학년에 맞는 체험수업을 보고 직접 예약해요. 전화 상담 없이 방문까지 이어져요.",
    checks: ["학년·과목별 노출", "남은 자리·시간 표시", "예약 전날 자동 알림"]
  },
  {
    icon: "icon-record-report.png",
    title: "체험이 등록으로 이어져요",
    body: "체험이 끝나면 기록을 쓰고 리포트를 보내요. 학부모는 리포트를 보고 등록을 결정해요.",
    checks: ["6단계로 정리되는 신청", "기록 → 학부모 리포트", "등록 결과·이유 기록"]
  },
  {
    icon: "icon-recontact.png",
    title: "등록 안 한 학생도 남아요",
    body: "미등록·고민 중 학생이 학원 DB로 남아요. 특강·새 반이 생기면 골라서 다시 안내해요.",
    checks: ["관심 과목·학년별 찾기", "새 반·특강 소식 한 번에", "연락 기록 자동 정리"]
  }
]

const flowSteps = [
  { title: "신청 접수", description: "학부모 앱에서 예약", tag: "자동" },
  { title: "일정 확정", description: "확정하면 알림 발송", tag: "자동 알림" },
  { title: "체험", description: "전날 리마인드", tag: "자동 알림" },
  { title: "기록 작성", description: "고르고 짧게 쓰기" },
  { title: "리포트 보내기", description: "학부모 앱으로 전송", tag: "푸시" },
  { title: "등록 결과", description: "등록·고민·미등록" }
]

// 목업은 모든 폭에서 잘라 내지 않고 전체를 보여 준다(모바일에서 일부만 잘리면 무슨 화면인지 알기 어렵다).
const features = [
  {
    eyebrow: "신청 관리",
    title: ["신청이", "단계별로 정리돼요"],
    body: "전화·카톡·엑셀에 흩어지던 체험 신청이 한 표에 모여요. 행마다 지금 할 일 버튼 하나만 있어요.",
    image: "partner-feature-applications.png",
    alt: "신청 관리 화면. 단계별 탭과 학생마다 지금 할 일 버튼이 있는 신청 표"
  },
  {
    eyebrow: "기록 · 리포트",
    title: ["기록하면", "리포트가 완성돼요"],
    body: "고르고 짧게 쓰면 오른쪽에 학부모가 볼 리포트가 바로 채워져요. 보내기 전에 미리 확인해요.",
    image: "partner-feature-record-report.png",
    alt: "체험 기록 화면. 왼쪽에 기록을 쓰면 오른쪽에 학부모가 볼 리포트 미리보기가 채워진다"
  },
  {
    eyebrow: "학원 소식",
    title: ["등록하지 않은 학생도", "다시 만나요"],
    body: "관심 과목·학년으로 골라 새 반·특강 소식을 한 번에 보내요. 수신에 동의한 보호자에게 첫수업이 대신 보내 드려요.",
    image: "partner-feature-recontact.png",
    alt: "학생 화면. 조건으로 고른 학생 3명에게 새 반 안내 문자를 보내는 패널",
    soon: !ACADEMY_NEWS_OPEN
  },
  {
    eyebrow: "분석",
    title: ["어디서 줄어드는지", "보여요"],
    body: "신청 → 체험 → 등록 흐름과 등록하지 않은 이유를 한눈에 봐요.",
    image: "partner-feature-analytics.png",
    alt: "분석 화면. 신청에서 등록까지 단계별 인원과 등록하지 않은 이유"
  }
]

type PlanItem = { label: string; strong?: boolean }

const freePlanItems: PlanItem[] = [
  { label: "수업 등록·공개 (개수 제한 없음)" },
  { label: "학부모 앱에서 체험 신청 받기" },
  { label: "일정 관리 · 수업 전날 자동 알림" },
  { label: "체험 기록 · 리포트 보내기", strong: true },
  { label: "등록 결과 기록 · 학생 기록" },
  { label: "기존 예약 가져오기" },
  { label: "선생님 등록 제한 없음" }
]

const standardPlanItems: PlanItem[] = [
  { label: "무료 플랜의 모든 기능" },
  { label: "학원 소식 문자 월 200건", strong: true },
  { label: "전환 분석 · 미등록 이유", strong: true },
  { label: "분기 성과 리포트" }
]

const startSteps = [
  {
    title: "학원 가입",
    body: `학원 정보와 사업자등록증을 올리면 첫수업 팀이 확인하고 승인해요. 승인되면 스탠다드 ${STANDARD_TRIAL_DAYS}일 무료가 바로 시작돼요.`
  },
  {
    title: "첫 수업 만들기",
    body: "수업 정보와 체험 시간을 정하면 학부모 앱에 바로 보여요."
  },
  {
    title: "학부모에게 알리기",
    body: "수업 링크를 카톡·문자로 보내면 학부모가 바로 체험을 예약해요. 전화로 받은 예약은 기존 예약 가져오기로 옮겨요."
  }
]

const faqItems = [
  {
    question: "지금 쓰는 학원관리 프로그램과 같이 써도 되나요?",
    answer: "네. 첫수업은 출결·수납이 아니라 체험 신청부터 등록 결정까지만 다뤄요. 같이 쓰셔도 겹치지 않아요."
  },
  {
    question: "학부모가 꼭 앱을 깔아야 하나요?",
    answer:
      "아니요. 학부모는 첫수업 앱이나 웹(firstsuup.com)에서 예약하고 리포트를 받아요. 전화로 받은 예약은 \"기존 예약 가져오기\"로 옮길 수 있어요."
  },
  {
    question: "체험비는 첫수업에서 결제되나요?",
    answer: "아니요. 체험비는 지금처럼 학원에서 직접 받으세요. 첫수업에서는 결제하지 않아요."
  },
  {
    question: `${STANDARD_TRIAL_DAYS}일 무료가 끝나면 자동으로 결제되나요?`,
    answer: `카드를 등록한 경우에만 결제돼요. 카드는 체험 종료 ${TRIAL_CARD_WINDOW_DAYS}일 전부터 등록할 수 있고, 등록하지 않으면 무료 플랜으로 바뀌어요.`
  },
  {
    question: "학생·학부모 정보는 안전한가요?",
    answer: "학원 계정에서만 볼 수 있고, 학부모가 동의한 범위에서만 쓰여요."
  }
]

function PlanList({ items }: { items: PlanItem[] }) {
  return (
    <ul className={styles.planList}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.planCheck} aria-hidden="true">
            ✓
          </span>
          <span className={item.strong ? styles.planStrong : undefined}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function PartnerLanding() {
  /* Studio 는 다른 origin 이다. 상대 경로로는 그 자리를 가리킬 수 없다. */
  const studioHref = await getStudioCrossProductHrefResolver()
  const signUpHref = studioHref("/studio/sign-up")

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navIn}`}>
          <a href="#top" className={styles.brand} aria-label="맨 위로">
            <Image
              src="/images/first-class-logo.png"
              alt="첫수업"
              width={86}
              height={29}
              className={styles.logo}
              priority
            />
          </a>

          <span className={styles.navSpacer} />

          <nav className={styles.navLinks} aria-label="파트너 랜딩 섹션 이동">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <Link href={studioHref("/studio/sign-in")} className={styles.navLogin}>
            로그인
          </Link>
          <Link href={signUpHref} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm} ${styles.navStart}`}>
            무료로 시작하기
          </Link>
        </div>
      </header>

      <section className={styles.hero} id="top">
        <div className={`${styles.wrap} ${styles.heroIn}`}>
          <p className={styles.heroBadge}>
            <span aria-hidden="true">🎁</span>
            <span>
              <span className={styles.pcOnly}>지금 가입하면 </span>스탠다드 {STANDARD_TRIAL_DAYS}일 무료 · 카드 등록 없음
            </span>
          </p>
          <h1 className={styles.heroTitle}>
            전화 상담 없이,
            <br />
            체험 예약부터 등록까지
          </h1>
          <p className={styles.heroSub}>
            학부모는 첫수업에서 체험을 직접 예약하고,
            <br className={styles.pcOnly} /> 원장님은 일정·기록·리포트·등록 결과를 한 화면에서 관리해요.
          </p>
          <div className={styles.heroActions}>
            <Link href={signUpHref} className={`${styles.btn} ${styles.btnPrimary}`}>
              무료로 시작하기
            </Link>
            <a href="#apply" className={`${styles.btn} ${styles.btnOutline}`}>
              도입 상담 신청
            </a>
          </div>
          <div className={styles.heroShot}>
            <div className={styles.heroShotFrame}>
              <Image
                src={`${IMAGE_DIR}/partner-hero-studio-home.png`}
                alt="첫수업 파트너 홈 화면. 가장 먼저 할 일, 오늘 체험, 체험에서 등록까지 단계별 학생 카드"
                width={1122}
                height={642}
                sizes="(max-width: 1170px) 1122px, 1122px"
                className={styles.heroShotImage}
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgWhite}`}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>학원 관계자 38명에게 물었어요</p>
            <h2 className={styles.title}>체험은 받는데, 그다음이 흩어져 있어요</h2>
          </div>
          <div className={styles.grid3}>
            {stats.map((stat) => (
              <div key={stat.value} className={styles.statCard}>
                <PersonPictogram value={stat.value} />
                <p className={styles.statValue}>
                  {stat.headline}
                  <span className={styles.statPercent}>{stat.value}%</span>
                </p>
                <p className={styles.statDesc}>
                  {stat.description[0]}
                  <br /> {stat.description[1]}
                </p>
                <p className={styles.statNote}>{stat.note}</p>
              </div>
            ))}
          </div>
          <p className={styles.footnote}>
            첫수업 자체 설문(깔로 패널) · 학원 원장·상담 담당자 38명, 초등 학부모 42명
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgFill}`}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>첫수업이 하는 일</p>
            <h2 className={styles.title}>새 학생을 만나고, 등록까지 이어 드려요</h2>
          </div>
          <div className={styles.grid3}>
            {pillars.map((pillar) => (
              <div key={pillar.title} className={styles.pillar}>
                {/* 아이콘은 흰 배경 이미지라 흰 카드 위에만 놓는다. */}
                <Image src={`${IMAGE_DIR}/${pillar.icon}`} alt="" width={96} height={96} className={styles.pillarIcon} />
                <h3 className={styles.cardTitle}>{pillar.title}</h3>
                <p className={styles.cardBody}>{pillar.body}</p>
                <ul className={styles.checks}>
                  {pillar.checks.map((check) => (
                    <li key={check}>
                      <span className={styles.checkMark} aria-hidden="true">
                        ✓
                      </span>
                      {check}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgWhite}`}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>신청부터 등록까지</p>
            <h2 className={styles.title}>한 학생의 흐름이 6단계로 정리돼요</h2>
            <p className={`${styles.sub} ${styles.pcOnly}`}>
              단계마다 지금 할 일 버튼 하나만 보여요. 알림은 첫수업이 대신 보내요.
            </p>
          </div>
          <ol className={styles.flow}>
            {flowSteps.map((step, index) => {
              const isLast = index === flowSteps.length - 1

              return (
                <li key={step.title} className={styles.flowItem}>
                  <div className={`${styles.flowStep} ${isLast ? styles.flowStepLast : ""}`}>
                    <span className={styles.flowNum}>{index + 1}</span>
                    <span className={styles.flowText}>
                      <span className={styles.flowTitle}>{step.title}</span>
                      <span className={styles.flowDesc}>{step.description}</span>
                    </span>
                    {step.tag ? <span className={styles.badge}>{step.tag}</span> : null}
                  </div>
                  {isLast ? null : (
                    <span className={styles.flowArrow} aria-hidden="true">
                      ›
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section className={styles.features} id="features">
        <div className={`${styles.wrap} ${styles.mobileOnly}`}>
          <div className={styles.featuresHead}>
            <p className={styles.eyebrow}>주요 기능</p>
            <h2 className={styles.title}>
              원장님 화면은
              <br />
              이렇게 생겼어요
            </h2>
          </div>
        </div>

        {features.map((feature, index) => {
          const isAlt = index % 2 === 1

          return (
            <div key={feature.eyebrow} className={`${styles.feature} ${isAlt ? styles.bgFill : styles.bgWhite}`}>
              <div className={`${styles.wrap} ${styles.featureRow} ${isAlt ? styles.featureRowReverse : ""}`}>
                <div className={styles.featureText}>
                  <div className={styles.featureEyebrowRow}>
                    <p className={styles.eyebrow}>{feature.eyebrow}</p>
                    {feature.soon ? <span className={`${styles.badge} ${styles.badgeSoon}`}>곧 열려요</span> : null}
                  </div>
                  <h3 className={styles.featureTitle}>
                    {feature.title[0]}
                    <br /> {feature.title[1]}
                  </h3>
                  <p className={styles.featureBody}>{feature.body}</p>
                </div>
                <div className={styles.featureMedia}>
                  <Image
                    src={`${IMAGE_DIR}/${feature.image}`}
                    alt={feature.alt}
                    width={758}
                    height={502}
                    sizes="(max-width: 1100px) 100vw, 758px"
                    className={styles.featureImage}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* 계산기는 무슨 서비스인지 본 다음, 요금 바로 앞에 둔다. */}
      <section className={`${styles.section} ${styles.bgGround}`} id="calculator">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>1분 계산</p>
            <h2 className={styles.title}>우리 학원은 얼마나 놓치고 있을까</h2>
            <p className={styles.calcSub}>
              숫자 세 개만 넣으면, 1년 동안 체험만 하고 지나간 학생과 그 원비를 계산해 드려요.
            </p>
          </div>
          <PartnerLossCalculator />
          <p className={styles.calcFootnote}>
            이 숫자는 이렇게 계산했어요 · (월 문의 − 월 등록) × 12개월 = 1년 동안 등록하지 않은 학생. 그중 다시
            연락해 등록하는 비율만큼, 월 원비 × 6개월로 계산한 단순 추정이에요. 실제 결과는 학원의 등록률과 수강
            기간에 따라 달라지며, 성과를 보장하지 않아요.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgWhite}`} id="price">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>요금</p>
            <h2 className={styles.title}>
              먼저 {STANDARD_TRIAL_DAYS}일,
              <br className={styles.mobileOnly} /> 모든 기능을 무료로 써 보세요
            </h2>
            <p className={styles.sub}>
              체험이 끝나도 카드를 등록하지 않으면 무료 플랜으로 바뀌어요. 학생·기록·리포트는 그대로 남아요.
            </p>
          </div>

          <div className={styles.plans}>
            <div className={styles.plan}>
              <div className={styles.planHead}>
                <h3 className={styles.planName}>무료</h3>
              </div>
              <div className={styles.planPrice}>
                <span className={styles.planAmount}>0원</span>
              </div>
              <p className={styles.planDesc}>체험 신청을 받고 등록 결과까지 관리하는 기본 기능</p>
              <PlanList items={freePlanItems} />
              <Link href={signUpHref} className={`${styles.btn} ${styles.btnOutline} ${styles.btnFull} ${styles.planCta}`}>
                무료로 시작하기
              </Link>
            </div>

            <div className={`${styles.plan} ${styles.planStandard}`}>
              <div className={styles.planHead}>
                <h3 className={styles.planName}>{BILLING_PLANS.standard.name}</h3>
                <span className={styles.badge}>{STANDARD_TRIAL_DAYS}일 무료 체험</span>
              </div>
              <div className={styles.planPrice}>
                <span className={`${styles.planAmount} ${styles.tnum}`}>{STANDARD_AMOUNT_TEXT}</span>
                <span className={styles.planCycle}>/ 월</span>
              </div>
              <p className={styles.planDesc}>등록을 늘리고, 등록하지 않은 학생을 다시 부르는 기능</p>
              <PlanList items={standardPlanItems} />
              <Link href={signUpHref} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull} ${styles.planCta}`}>
                {STANDARD_TRIAL_DAYS}일 무료로 시작하기
              </Link>
            </div>
          </div>

          {/*
            정기결제·해지 조건은 가격과 같은 위계로 보여야 한다.
            작은 회색 각주로 숨기지 않는다(카드사 심사 요건).
          */}
          <div className={styles.planTerms}>
            <p>
              <b>입점 승인 후 {STANDARD_TRIAL_DAYS}일 동안 스탠다드를 무료로 써요.</b> 체험을 시작할 때 카드를
              등록하지 않고, 카드는 체험 종료 {TRIAL_CARD_WINDOW_DAYS}일 전부터 등록할 수 있어요. 카드를 등록하고
              동의한 경우에만 체험 마지막 날 첫 이용료(월 {STANDARD_AMOUNT_TEXT})가 결제되고, 그 전에 해지하면
              결제되지 않아요. 카드를 등록하지 않으면 체험이 끝날 때 무료 플랜으로 바뀌어요. 첫 결제가 되지 않으면{" "}
              {BILLING_GRACE_PERIOD_DAYS}일 동안 다시 시도해요.
            </p>
            <p>
              <b>스탠다드는 월 단위 정기결제예요.</b> 결제일부터 1개월 동안 쓸 수 있고, 해지하기 전까지 매월 자동으로
              결제돼요.
            </p>
            <p>
              <b>해지는 언제든 할 수 있어요.</b> 해지해도 현재 결제 기간이 끝날 때까지 쓸 수 있고, 다음 결제일부터
              자동 결제되지 않아요.
            </p>
            <Link href="/refund-policy" className={styles.planTermsLink}>
              환불 및 해지 정책 보기
            </Link>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgFill}`}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>시작하기</p>
            <h2 className={styles.title}>오늘 가입하면, 이번 주부터 체험 신청을 받아요</h2>
          </div>
          <ol className={styles.grid3}>
            {startSteps.map((step, index) => (
              <li key={step.title} className={styles.startCard}>
                <span className={styles.startNum}>{index + 1}</span>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardBody}>{step.body}</p>
              </li>
            ))}
          </ol>

          {/* Figma 에는 폼이 없다. 같은 카드 톤(흰색 · radius 20 · 패딩 40)으로 맞춘다. */}
          <div className={styles.apply} id="apply">
            <div className={styles.applyText}>
              <h2 className={styles.applyTitle}>도입 상담 신청</h2>
              <p className={styles.applyDesc}>
                학원명과 연락처를 남겨 주시면 운영 방식에 맞는 도입 방법을 안내해 드려요.
              </p>
            </div>
            <PartnerInquiryForm />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bgWhite} ${styles.faq}`} id="faq">
        <div className={`${styles.wrap} ${styles.faqRow}`}>
          <div className={styles.faqHead}>
            <h2 className={styles.faqTitle}>자주 묻는 질문</h2>
            <p className={styles.faqSub}>
              더 궁금한 점은 <a href={COMPANY_EMAIL_HREF}>{COMPANY_INFO.customerCenterEmail}</a>으로 물어봐 주세요.
            </p>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <div key={item.question} className={styles.faqItem}>
                <h3 className={styles.faqQ}>{item.question}</h3>
                <p className={styles.faqA}>{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={`${styles.wrap} ${styles.ctaIn}`}>
          <h2 className={styles.ctaTitle}>
            문의는 광고가 만들고,
            <br className={styles.mobileOnly} /> 등록은 첫수업이 만들어요
          </h2>
          <p className={styles.ctaSub}>지금 가입하면 스탠다드 {STANDARD_TRIAL_DAYS}일 무료 · 카드 등록 없음</p>
          <div className={styles.ctaActions}>
            <Link href={signUpHref} className={`${styles.btn} ${styles.btnOutline}`}>
              무료로 시작하기
            </Link>
            <a href="#apply" className={`${styles.btn} ${styles.btnTint}`}>
              도입 상담 신청
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerIn}`}>
          <div className={styles.footerInfo}>
            <Image src="/images/first-class-logo.png" alt="첫수업" width={66} height={22} className={styles.footerLogo} />
            <p className={styles.footerText}>
              {COMPANY_INFO.name} · 대표 {COMPANY_INFO.representative} · 사업자등록번호{" "}
              <span className={styles.tnum}>{COMPANY_INFO.businessRegistrationNumber}</span> · 문의{" "}
              {COMPANY_INFO.customerCenterEmail}
              <br />
              주소 {COMPANY_ADDRESS}
            </p>
          </div>
          <nav className={styles.footerLinks} aria-label="정책 및 바로가기">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/refund-policy">환불 및 해지 정책</Link>
            <Link href="/">학부모 앱</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
