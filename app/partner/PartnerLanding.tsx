import Image from "next/image"
import Link from "next/link"

import styles from "./partner.module.css"

const navItems = [
  { href: "#problem", label: "왜 첫수업인가" },
  { href: "#features", label: "파트너 센터" },
  { href: "#pricing", label: "요금제" },
  { href: "#pilot", label: "파일럿 혜택" },
  { href: "#contact", label: "문의하기" }
]

const problemCards = [
  {
    icon: "💬",
    title: "흩어진 문의 채널",
    description: "전화·카카오톡·수기 일정표로 체험수업 문의가 여기저기 흩어져 있다"
  },
  {
    icon: "⏰",
    title: "예고 없는 노쇼",
    description: "노쇼가 발생해도 파악이 늦어 시간과 수업 자리를 낭비한다"
  },
  {
    icon: "📝",
    title: "누락되는 상담 이력",
    description: "체험 후 상담 내용을 놓쳐 등록으로 이어질 기회를 잃는다"
  },
  {
    icon: "📊",
    title: "보이지 않는 전환율",
    description: "어떤 채널에서 몇 명이 등록까지 이어졌는지 파악하기 어렵다"
  }
]

const featureRows = [
  {
    tag: "체험 수업, 레벨 테스트",
    title: ["후기보다 강력한 건, 직접 경험한", "한 번의 수업"],
    description:
      "블로그 후기와 광고로는 전할 수 없는 우리 학원의 수업력. 체험수업 한 번이면 충분합니다. 첫수업은 그 기회를 예약으로 연결합니다.",
    items: [
      "신규 신청·상담 대기를 놓치지 않도록 표시",
      "등록 전환율 자동 계산",
      "학생별 진행 카드로 한 장에서 확인"
    ],
    image: {
      src: "/images/partner/dashboard.jpg",
      alt: "첫수업 파트너 센터 대시보드 화면",
      width: 1400,
      height: 791
    }
  },
  {
    tag: "예약·일정·상태 관리",
    title: ["전화 받고, 카톡 확인하고,", "수첩에 적는 일은 이제 그만"],
    description:
      "여기저기 흩어져 있던 예약 관리가 하나로 정리됩니다. 수업 중이라 놓친 전화 한 통이 등록생 한 명일 수 있습니다. 첫수업에서는 학부모가 직접 예약하고, 학원은 알림으로 확인만 하면 됩니다.",
    items: [
      "상태별 원클릭 필터링",
      "학생·보호자 정보와 담당 선생님 통합 확인",
      "목록에서 바로 상태 변경 및 상담 기록 입력"
    ],
    reverse: true,
    image: {
      src: "/images/partner/schedule.jpg",
      alt: "첫수업 파트너 센터 일정 관리 화면",
      width: 900,
      height: 507
    }
  },
  {
    tag: "상담 기록·재문의 관리",
    title: ["오늘 등록하지 않아도,", "기록은 남습니다"],
    description:
      "상담 이력이 사람 기억에만 남아 있으면, 그 사람이 없을 때 기회도 사라집니다. 첫수업은 학원의 상담 자산을 시스템에 남깁니다.",
    items: ["공개/비공개 상태를 즉시 전환", "담당 선생님·대상 학년·체험비 관리", "예약 시간대 설정"],
    image: {
      src: "/images/partner/applications.jpg",
      alt: "첫수업 파트너 센터 신청 관리 화면",
      width: 1400,
      height: 785
    }
  },
  {
    tag: "등록 전환",
    title: ["체험에서 등록까지,", "새는 곳 없이"],
    description:
      "체험수업은 이미 등록 직전까지 온 학부모입니다. 첫수업은 체험→상담→등록 흐름을 추적해서, 어디서 이탈하는지 보여주고 후속 관리로 연결합니다.",
    items: ["공개/비공개 상태를 즉시 전환", "담당 선생님·대상 학년·체험비 관리", "예약 시간대 설정"],
    image: {
      src: "/images/partner/application-detail.png",
      alt: "첫수업 파트너 센터 등록 전환 관리 화면",
      width: 3052,
      height: 1726
    }
  },
  {
    tag: "운영 리포트",
    title: ["감이 아니라 숫자로 보는", "우리 학원 체험수업"],
    description:
      "예약 수, 참석률, 노쇼율, 등록 전환율까지. 어떤 시간대의 체험수업이 등록으로 이어지는지 데이터로 확인하세요.",
    items: ["공개/비공개 상태를 즉시 전환", "담당 선생님·대상 학년·체험비 관리", "예약 시간대 설정"],
    image: {
      src: "/images/partner/dashboard.jpg",
      alt: "첫수업 파트너 센터 운영 리포트 대시보드 화면",
      width: 1400,
      height: 791
    }
  }
]

const compareRows = [
  ["체험수업 예약", "O", "△", "O"],
  ["체험 일정·상태 관리", "O", "X", "O"],
  ["상담·등록 전환 관리", "O", "X", "X"],
  ["데이터 기반 전환 분석", "O", "X", "X"]
]

const pricingCards = [
  {
    tag: "BASIC",
    name: "기본 이용료",
    description: ["학원 계정 1개 기준", "월 구독형 SaaS"]
  },
  {
    tag: "ADD-ON",
    name: "부가 옵션",
    description: ["관리자 추가 · 지점 추가", "알림 발송 등 사용량 과금"]
  }
]

const perks = [
  {
    icon: "🚀",
    title: "초기 이용료 혜택",
    description: "파일럿 기간 이후 정식서비스 3개월 이용권 제공"
  },
  {
    icon: "🤝",
    title: "밀착 온보딩 지원",
    description: "슬롯 등록부터 운영까지 직접 지원"
  },
  {
    icon: "💬",
    title: "의견 우선 반영",
    description: "학원 현장 요청 기능을 우선 개발"
  }
]

const faqItems = [
  {
    question: "기존 카카오톡 상담도 계속 사용할 수 있나요?",
    answer:
      "네, 기존 상담 방식은 그대로 사용하실 수 있습니다. 첫수업은 카카오톡 상담을 대체하는 서비스가 아니라, 상담 전후에 발생하는 체험수업 신청, 일정 관리, 담당 선생님 배정, 진행 상태 관리를 체계화하는 서비스입니다. 학부모와의 자세한 상담은 기존 카카오톡으로 진행하고, 첫수업에서는 신청 내역과 후속 진행 상황을 한눈에 관리할 수 있습니다."
  },
  {
    question: "설치는 얼마나 걸리나요?",
    answer:
      "별도의 프로그램을 설치할 필요가 없는 웹 기반 서비스입니다. 학원 계정을 만든 뒤 수업과 선생님 정보를 등록하면 바로 사용할 수 있습니다. 파일럿 기간에는 초기 설정과 수업 등록을 함께 도와드리기 때문에, 복잡한 프로그램을 새로 배우지 않아도 운영을 시작할 수 있습니다."
  },
  {
    question: "직원 여러 명이 함께 사용할 수 있나요?",
    answer:
      "네, 가능합니다. 학원 관리자뿐 아니라 담당 선생님도 함께 사용할 수 있으며, 선생님별로 자신이 담당하는 수업과 체험 신청 일정을 확인할 수 있습니다. 여러 직원이 엑셀이나 단체 채팅방을 번갈아 확인하지 않아도, 동일한 정보를 기준으로 체험생을 관리할 수 있습니다."
  },
  {
    question: "문자·알림톡도 보낼 수 있나요?",
    answer:
      "네, 체험수업 운영에 필요한 안내 메시지를 발송할 수 있습니다. 예를 들어 학부모에게는 체험수업 신청 완료, 일정 확정, 수업 하루 전 안내 등을 보낼 수 있고, 담당 선생님에게는 새로운 신청이나 일정 변경 내용을 안내할 수 있습니다. 카카오 알림톡 발송이 어려운 경우를 대비해 문자 발송을 함께 활용하는 방식도 준비하고 있습니다."
  },
  {
    question: "체험생은 어떻게 유입되나요?",
    answer:
      "학원에서 등록한 체험수업은 첫수업의 수업 페이지에 노출되며, 학부모가 수업 정보를 확인하고 직접 신청할 수 있습니다. 또한 학원 블로그, 홈페이지, 인스타그램, 문자, 카카오톡 상담 등에 수업 신청 링크를 공유해 기존 홍보 채널에서도 활용할 수 있습니다. 초기 파일럿에서는 첫수업 자체 유입뿐 아니라, 학원이 이미 보유한 상담 채널을 신청으로 연결하는 것에 중점을 둡니다."
  },
  {
    question: "기존 예약도 등록할 수 있나요?",
    answer:
      "네, 전화나 카카오톡으로 받은 기존 체험 예약도 첫수업에서 함께 관리할 수 있습니다. 온라인으로 들어온 신청뿐 아니라 기존 상담 채널에서 접수된 예약까지 한곳에 정리하면, 누락 없이 일정과 진행 상태를 확인할 수 있습니다. 파일럿 기간에는 기존 예약 데이터를 어떤 방식으로 옮기고 관리할지 학원 상황에 맞춰 안내해드립니다."
  },
  {
    question: "어떤 학원이 사용하면 효과가 큰가요?",
    answer:
      "체험수업, 레벨테스트, 입학테스트, 상담 예약을 운영하는 학원에 특히 효과적입니다. 문의와 예약을 카카오톡, 전화, 엑셀로 나누어 관리하는 학원, 체험수업 이후 등록 여부를 체계적으로 확인하기 어려운 학원, 여러 선생님이 체험수업을 나누어 담당하는 학원, 신청 누락이나 일정 전달 실수를 줄이고 싶은 학원, 어떤 수업이 실제 등록으로 연결되는지 확인하고 싶은 학원이라면 활용도가 높습니다."
  },
  {
    question: "파일럿 기간에는 어떤 지원을 받을 수 있나요?",
    answer:
      "파일럿 참여 학원에는 단순히 계정만 제공하지 않고, 실제 운영에 적용할 수 있도록 초기 설정을 함께 지원합니다. 학원 정보와 수업 등록, 선생님 계정 설정, 체험수업 운영 방식 정리, 문자·알림톡 안내 설정 등을 지원하며, 사용 중 불편한 점과 필요한 기능을 지속적으로 반영합니다. 파일럿 기간 동안 쌓인 신청과 운영 데이터를 바탕으로, 체험수업 신청 수, 진행 현황, 등록 전환 결과 등을 확인할 수 있도록 도와드립니다."
  }
]

const footerLinks = [
  { href: "#problem", label: "왜 첫수업인가" },
  { href: "#features", label: "파트너 센터" },
  { href: "#pricing", label: "이용 방법" },
  { href: "#contact", label: "문의하기" }
]

export default function PartnerLanding() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a className={styles.logo} href="#top" aria-label="첫수업 파트너 랜딩 상단으로 이동">
            <Image
              src="/images/first-class-logo.png"
              alt="첫수업"
              width={93}
              height={30}
              className={styles.logoImage}
              priority
            />
          </a>

          <nav className={styles.navLinks} aria-label="파트너 랜딩 섹션 이동">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnGhost}`} href="/classes">
              학부모 플랫폼 둘러보기
            </Link>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="/studio/sign-up">
              파트너 신청
            </a>
          </div>
        </div>
      </header>

      <div className={styles.mobileFloatingCta}>
        <Link className={`${styles.btn} ${styles.btnGhost}`} href="/classes">
          학부모 플랫폼 둘러보기
        </Link>
        <a className={`${styles.btn} ${styles.btnPrimary}`} href="/studio/sign-up">
          파트너 신청
        </a>
      </div>

      <section className={styles.hero} id="top">
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>학원을 위한 체험수업, 레벨테스트 관리 서비스</p>
            <div className={styles.heroCopyGroup}>
              <h1 className={styles.heroTitle}>
                체험수업 신청부터
                <br />
                등록까지, 한 곳에서
                <br />
                관리하세요
              </h1>
              <p className={styles.heroSub}>
                전화·카톡·수기 일정표에 흩어져 있던
                <br />
                체험 관리가 하나로 정리됩니다
              </p>
            </div>
          </div>

          <div className={styles.heroMedia} aria-hidden="true">
            <div className={styles.heroBlurPrimary} />
            <div className={styles.heroBlurSecondary} />
            <Image
              src="/images/partner/hero-phone-figma.png"
              alt=""
              width={2274}
              height={2028}
              className={styles.heroDevice}
              priority
            />
          </div>
        </div>
      </section>

      <section className={styles.problems} id="problem">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>이런 고민, 있으신가요</span>
            <h2>
              체험수업 운영, 여전히 전화와 카카오톡에
              <br />
              의존하고 계시지 않나요?
            </h2>
          </div>

          <div className={styles.problemGrid}>
            {problemCards.map((card) => (
              <article className={styles.problemCard} key={card.title}>
                <div className={styles.problemIcon} aria-hidden="true">
                  {card.icon}
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.features} id="features">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>첫수업 파트너 센터</span>
            <h2>
              체험수업 관리에 필요한 기능을
              <br />
              한 곳에 모았어요
            </h2>
          </div>

          {featureRows.map((feature, index) => (
            <div
              className={`${styles.featureRow} ${index % 2 === 1 ? styles.featureRowReverse : ""}`}
              key={feature.tag}
            >
              <div className={`${styles.featureMedia} ${index === 0 ? styles.featureMediaOverlay : ""}`}>
                <div className={styles.browserBar} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <Image
                  src={feature.image.src}
                  alt={feature.image.alt}
                  width={feature.image.width}
                  height={feature.image.height}
                  className={styles.featureImage}
                />
                {index === 0 ? (
                  <div className={styles.featureFloatingCard}>
                    <Image
                      src="/images/partner/class-detail-overlay.png"
                      alt="수업 상세 예시 화면"
                      width={535}
                      height={1021}
                      className={styles.featureFloatingImage}
                    />
                  </div>
                ) : null}
              </div>

              <div className={styles.featureText}>
                <span className={styles.featureTag}>{feature.tag}</span>
                <h3>
                  {feature.title[0]}
                  <br />
                  {feature.title[1]}
                </h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}

        </div>
      </section>

      <section className={styles.compare}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>차별점</span>
            <h2>기존 서비스와 무엇이 다른가요?</h2>
            <p>정보탐색·범용예약 서비스는 체험수업 운영 퍼널 전체를 연결하지 못합니다</p>
          </div>

          <div className={styles.compareTableWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>비교 항목</th>
                  <th className={styles.highlightHead}>첫수업</th>
                  <th>정보탐색 플랫폼</th>
                  <th>범용 예약 서비스</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td className={styles.markO}>{row[1]}</td>
                    <td className={row[2] === "△" ? styles.markT : styles.markX}>{row[2]}</td>
                    <td className={row[3] === "O" ? styles.markO : styles.markX}>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.pricing} id="pricing">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>요금제</span>
            <h2>
              체험수업, 레벨테스트를 위한
              <br />
              가장 완벽한 선택
            </h2>
          </div>

          <div className={styles.priceGrid}>
            {pricingCards.map((card) => (
              <article className={styles.priceCard} key={card.name}>
                <span className={styles.priceTag}>{card.tag}</span>
                <div className={styles.priceName}>{card.name}</div>
                <p className={styles.priceDesc}>
                  {card.description[0]}
                  <br />
                  {card.description[1]}
                </p>
              </article>
            ))}
          </div>

          <p className={styles.priceNote}>현재 파일럿 기간이므로 무료로 이용 가능합니다.</p>
        </div>
      </section>

      <section className={styles.pilot} id="pilot">
        <div className={styles.wrap}>
          <div className={`${styles.sectionHead} ${styles.sectionHeadOnGreen}`}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnGreen}`}>파일럿 파트너 모집</span>
            <h2>
              후곡·백마 학원가
              <br />
              파일럿 파트너를 모집합니다
            </h2>
            <p>지금 함께하시는 학원에는 아래와 같은 혜택을 드립니다</p>
          </div>

          <div className={styles.perkGrid}>
            {perks.map((perk) => (
              <article className={styles.perkCard} key={perk.title}>
                <div className={styles.perkIcon} aria-hidden="true">
                  {perk.icon}
                </div>
                <h3>{perk.title}</h3>
                <p>{perk.description}</p>
              </article>
            ))}
          </div>

          <p className={styles.pilotNote}>
            * 파일럿 참여 학원은 순차 모집되며, 조기 마감될 수 있습니다
          </p>
        </div>
      </section>

      <section className={styles.faq} id="faq">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>FAQ</span>
            <h2>
              원장님들이 가장 많이 묻는 질문
            </h2>
          </div>

          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <details className={styles.faqItem} key={item.question}>
                <summary className={styles.faqQuestion}>
                  <span>{item.question}</span>
                  <span className={styles.faqIcon} aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              <Image
                src="/images/first-class-logo.png"
                alt="첫수업"
                width={93}
                height={30}
                className={styles.footerLogoImage}
              />
              <p className={styles.footTag}>
                체험수업 신청부터 등록전환까지, 학원을 위한 운영·전환 관리 SaaS.
                <br />
                Try First. Choose Right.
              </p>
            </div>

            <div>
              <h5>바로가기</h5>
              <ul className={styles.footerList}>
                {footerLinks.map((item) => (
                  <li key={item.href}>
                    <a href={item.href}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h5>고객센터</h5>
              <ul className={styles.footerList}>
                <li>010-8384-0825</li>
                <li>firstsuup0625@naver.com</li>
                <li>
                  평일 09:00 - 18:00
                  <br />
                  (주말/공휴일 휴무)
                </li>
              </ul>
            </div>
          </div>

          <div className={styles.footBiz}>
            <b>첫수업</b> · 대표 김원식 · 사업자등록번호 775-07-03279
            <br />
            경기도 고양시 일산동구 무궁화로 20-38, 5층 500-17호 (장항동, 로데오탑)
          </div>

          <div className={styles.footBottom}>
            <span>© 2026 첫수업. All Rights Reserved.</span>
            <span>firstsuup.com</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
