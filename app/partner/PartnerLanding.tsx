import Image from "next/image"
import Link from "next/link"

import PartnerCopyButton from "./PartnerCopyButton"
import PartnerInquiryForm from "./PartnerInquiryForm"
import PartnerLossCalculator from "./PartnerLossCalculator"
import styles from "./partner.module.css"

const TALLY_URL = "https://tally.so/r/b5XeNL"
const PARTNER_LINK = "firstsuup.com/c/은행사거리-○○학원"

const navItems = [
  { href: "#why", label: "왜 필요한가" },
  { href: "#link", label: "도입 방식" },
  { href: "#features", label: "핵심 기능" },
  { href: "#compare", label: "기존 방식과 비교" },
  { href: "#price", label: "파일럿" }
]

const stripItems = [
  "첫수업 초기 파일럿 파트너 모집 중",
  "파일럿 기간 이용료 0원"
]

const flowCards = [
  {
    number: "01",
    title: ["문의가 채널마다", "따로 들어옵니다"],
    description:
      "전화·카톡·네이버 플레이스에 문의가 흩어져 나중에 다시 찾기 어렵습니다."
  },
  {
    number: "02",
    title: ["체험은 왔는데", "시간이 안 맞습니다"],
    description:
      "아이도 수업을 좋아했지만 원하는 요일이나 시간이 없으면 등록으로 이어지지 않습니다."
  },
  {
    number: "03",
    title: ["새 반을 열어도", "부를 사람을 모릅니다"],
    description:
      "희망 일정이 기록되지 않아 새 반이 생겨도 다시 연락할 학생을 찾기 어렵습니다.",
    emphasized: true
  }
]

const stats = [
  { value: "95%", description: "최근 3개월 안에 놓친 경험이 있다" },
  { value: "32%", description: "노쇼·참석 확인이 늦어 대응하지 못했다" },
  { value: "26%", description: "상담 내용·레벨테스트 결과가 빠졌다" },
  { value: "66%", description: "등록 여부를 엑셀·수기·카톡으로 확인한다" }
]

const channels = [
  { label: "네이버 플레이스", tag: "링크 걸기" },
  { label: "블로그 · 인스타그램 프로필", tag: "링크 걸기" },
  { label: "카카오톡 채널 · 학부모 단톡방", tag: "링크 걸기" },
  { label: "학원 앞 배너 · 전단지", tag: "QR 인쇄" }
]

const featureCards = [
  {
    title: ["신청부터 등록까지", "상태가 끊기지 않습니다"],
    description:
      "신청·확정·변경·취소·노쇼·완료·등록을 하나의 흐름으로 관리합니다."
  },
  {
    title: ["미등록 학생도", "다음 기회로 남습니다"],
    description:
      "등록하지 않은 이유와 상담 내용을 남겨 방학·학기 초에 다시 연락할 수 있습니다."
  },
  {
    title: ["새 반을 열 때", "근거가 생깁니다"],
    description:
      "희망 요일·시간을 확인해 실제 수요를 보고 반을 구성할 수 있습니다."
  }
]

const compareRows = [
  {
    moment: "체험 문의",
    currentTitle: "채널마다 따로 들어옵니다",
    currentDescription:
      "전화·카톡·플레이스에 문의가 흩어집니다.",
    partnerTitle: "신청 링크 하나로 들어옵니다",
    partnerDescription:
      "신청 정보가 한곳에 모여 이후 관리까지 이어집니다."
  },
  {
    moment: "체험 당일",
    currentTitle: "왔는지 안 왔는지 나중에 압니다",
    currentDescription:
      "별도로 적지 않으면 참석·노쇼 기록이 남지 않습니다.",
    partnerTitle: "참석과 노쇼가 기록으로 남습니다",
    partnerDescription:
      "체험 결과가 학생 기록과 바로 연결됩니다."
  },
  {
    moment: "시간이\n안 맞아 보류",
    currentTitle: '"시간이 안 맞네요"로 끝납니다',
    currentDescription:
      "원했던 요일과 시간이 담당자의 기억에만 남습니다.",
    partnerTitle: "원하는 요일과 시간이 남습니다",
    partnerDescription:
      "상담 내용과 희망 조건을 학생별로 기록합니다."
  },
  {
    moment: "다음 학기\n새 반 개설",
    currentTitle: "부를 사람을 모릅니다",
    currentDescription:
      "다시 연락할 학생을 찾기 어렵습니다.",
    partnerTitle: "그 시간을 원했던 학생부터 확인합니다",
    partnerDescription:
      "새 반이 생기면 조건이 맞는 학생에게 다시 연락할 수 있습니다.",
    isFinal: true
  }
]

const pricingItems = [
  "전용 신청 페이지 · QR",
  "관리자 계정 1개",
  "수업 등록 제한 없음",
  "상담 이력 · 레벨테스트 기록",
  "미등록 학생 명단 · 운영 리포트"
]

const addOnItems = ["관리자 계정 추가", "지점 추가", "문자 발송 (건당 실비)"]

const perks = [
  {
    title: "파일럿 기간 이용료 0원",
    description: "정식 출시 전까지 이용료를 받지 않습니다."
  },
  {
    title: "도입 전후 비교 리포트",
    description: "도입 전후의 체험·노쇼·등록 데이터를 비교해드립니다."
  },
  {
    title: "온보딩 직접 지원",
    description: "수업 등록과 신청 링크 설정까지 함께 진행합니다."
  }
]

const faqItems = [
  {
    question: "지금 쓰는 카카오톡 상담도 계속 쓸 수 있나요?",
    answer:
      "네. 전화·카카오톡·네이버 등 기존 채널은 그대로 사용하시면 됩니다. 첫수업은 신청 이후의 체험·상담·등록 기록을 관리합니다."
  },
  {
    question: "설치는 얼마나 걸리나요?",
    answer: "별도 프로그램 설치 없이 브라우저에서 바로 사용할 수 있습니다."
  },
  {
    question: "선생님 여러 분이 같이 쓸 수 있나요?",
    answer: "가능합니다. 담당자가 달라도 학생의 이전 상담 기록을 이어서 확인할 수 있습니다."
  },
  {
    question: "지금 쓰는 네이버·블로그·SNS 유입도 연결할 수 있나요?",
    answer:
      "기존 네이버·블로그·SNS 등에 학원 전용 신청 링크를 연결하면 신청 정보가 첫수업으로 들어옵니다."
  },
  {
    question: "이미 잡아둔 체험 일정도 넣을 수 있나요?",
    answer: "네. 기존에 받아둔 일정도 등록해서 함께 관리할 수 있습니다."
  }
]

export default function PartnerLanding() {
  return (
    <main className={styles.page}>
      <header className={styles.hd}>
        <div className={styles.hdIn}>
          <a href="#top" className={styles.logo} aria-label="첫수업 파트너 랜딩 상단으로 이동">
            <Image
              src="/images/first-class-logo.png"
              alt="첫수업"
              width={93}
              height={30}
              className={styles.logoImage}
              priority
            />
          </a>

          <nav className={styles.nav} aria-label="파트너 랜딩 섹션 이동">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className={styles.hdCta}>
            <Link href="/classes" className={`${styles.btn} ${styles.btnO} ${styles.btnSm}`}>
              학부모 플랫폼
            </Link>
            <Link href="/studio/sign-in" className={`${styles.btn} ${styles.btnG} ${styles.btnSm}`}>
              로그인
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero} id="top">
        <div className={`${styles.wrap} ${styles.heroIn}`}>
          <div>
            <p className={styles.heroCat}>체험 신청부터 상담 기록, 등록 여부까지 한곳에서</p>
            <h1 className={styles.heroTitle}>
              작년에 체험만 하고
              <br />
              사라진 학생, <em>몇 명</em>이었나요
            </h1>
            <p className={styles.h1Sub}>
              대부분의 학원이 체험 후 놓친 학생이 몇 명인지 따로 세어보지 않습니다. 평소 한 달
              문의와 등록 수만 넣어보세요.
            </p>
            <div className={styles.h1Btns}>
              <a href="#apply" className={`${styles.btn} ${styles.btnG}`}>
                무료 도입 상담
              </a>
            </div>
            <div className={styles.heroMeta}>
              <span>설치 없이 브라우저에서</span>
              <span>기존 채널 그대로 사용</span>
              <span>파일럿 기간 무료</span>
            </div>
          </div>

          <PartnerLossCalculator />
        </div>
      </section>

      <div className={styles.strip}>
        <div className={styles.stripIn}>
          {stripItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
          <a href={TALLY_URL}>도입 상담 신청 →</a>
        </div>
      </div>

      <section className={styles.sec} id="why">
        <div className={styles.wrap}>
          <p className={styles.kick}>체험과 등록 사이</p>
          <h2 className={styles.sectionHeading}>
            마음에 안 들어서가 아니라,
            <br />
            그때 <em>시간이 안 맞아서</em>입니다
          </h2>
          <p className={styles.sub}>
            체험까지 온 학생은 이미 관심이 있는 학생입니다. 문제는 등록하지 않은 이유와 원하는 조건이
            기록되지 않는다는 것입니다.
          </p>

          <div className={styles.flow}>
            {flowCards.map((card) => (
              <div
                key={card.number}
                className={`${styles.fl} ${card.emphasized ? styles.flDead : ""}`}
              >
                <p className={styles.flN}>{card.number}</p>
                <h4>
                  {card.title[0]}
                  <br />
                  {card.title[1]}
                </h4>
                <p>{card.description}</p>
              </div>
            ))}
          </div>

          <p className={styles.strongSub}>
            희망 요일과 시간이 남습니다. 광고비를 쓰기 전에,
            <em> 이미 관심을 보인 학부모부터 다시 연결할 수 있습니다.</em>
          </p>

          <div className={styles.stats}>
            {stats.map((item) => (
              <div key={item.value + item.description}>
                <b className={styles.tnum}>{item.value}</b>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
          <p className={styles.note}>2026년 7월 첫수업 자체 설문 (조사 진행: 깔로) · 학원 관계자 38명 응답</p>
        </div>
      </section>

      <section className={styles.quoteSection}>
        <div className={styles.wrap}>
          <div className={styles.qb}>
            <p className={styles.qt}>
              &quot;상담 내용은 다 제 머리랑 수첩에 있어요.
              <br />
              그래서 실장님이 그만두시면
              <br />
              그동안 상담한 게 통째로 없어집니다.&quot;
            </p>
            <p className={styles.qy}>은행사거리 A학원 원장님 · 2026년 7월 방문 인터뷰</p>
          </div>
        </div>
      </section>

      <section className={`${styles.sec} ${styles.alt}`} id="link">
        <div className={styles.wrap}>
          <p className={styles.kick}>시작은 링크 하나</p>
          <h2 className={styles.sectionHeading}>
            쓰시던 채널 그대로,
            <br />
            <em>링크만</em> 걸어두시면 됩니다
          </h2>
          <p className={styles.sub}>
            학원 전용 체험수업 신청 페이지를 만들어드립니다. 기존 네이버·블로그·카카오톡은 그대로
            사용하시면 됩니다.
          </p>

          <div className={styles.ld}>
            <div>
              <div className={styles.chan}>
                {channels.map((channel) => (
                  <div key={channel.label}>
                    {channel.label}
                    <span>{channel.tag}</span>
                  </div>
                ))}
              </div>
              <div className={styles.urlbox}>
                <code>{PARTNER_LINK}</code>
                <PartnerCopyButton value={PARTNER_LINK} />
              </div>
              <p className={`${styles.note} ${styles.linkNote}`}>
                링크로 들어온 신청은 학원 운영 화면에 바로 쌓입니다.
              </p>
            </div>

            <div className={styles.panel}>
              <div className={styles.phone}>
                <div className={styles.phoneScr}>
                  <div className={styles.phBar}>○○학원 · 체험수업 신청</div>
                  <div className={styles.phBody}>
                    <div className={styles.phCard}>
                      <span className={styles.phTag}>초1–초3</span>
                      <div className={styles.phT}>사고력수학 체험수업</div>
                      <div className={styles.phM}>50분 · 체험비 없음 · 박○○ 선생님</div>
                    </div>
                    <div className={styles.phCard}>
                      <div className={styles.phT}>날짜 고르기</div>
                      <div className={styles.phM}>3월 14일 (목) 오후 4시 · 2자리 남음</div>
                    </div>
                    <div className={styles.phCard}>
                      <div className={styles.phT}>학생 · 학부모 정보</div>
                      <div className={styles.phM}>이름 / 학년 / 연락처</div>
                    </div>
                    <div className={styles.phBtn}>신청하기</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.sec} id="features">
        <div className={styles.wrap}>
          <p className={styles.kick}>기능</p>
          <h2 className={styles.sectionHeading}>
            예약받는 도구가 아니라,
            <br />
            <em>등록까지 이어지는 흐름</em>을 관리합니다
          </h2>

          <div className={styles.fhero}>
            <div>
              <p className={styles.fLbl}>상담 이력 · 레벨테스트 기록</p>
              <h3>
                담당자가 바뀌어도
                <br />
                상담 맥락은 그대로 남습니다
              </h3>
              <p>
                체험 반응, 레벨테스트 결과, 상담 내용, 희망 요일·시간을 학생별로 누적합니다. 미등록
                학생도 다시 연락할 수 있는 기록으로 남습니다.
              </p>
            </div>

            <div className={styles.shotpanel}>
              <div className={styles.shot}>
                <div className={styles.shotBar}>
                  <i className={styles.dot} />
                  <i className={styles.dot} />
                  <i className={styles.dot} />
                </div>
                <div className={styles.shotPh}>
                  <span>
                    <strong>실제 제품 캡처 영역 ①</strong>
                    <br />
                    학생 상담 상세 / 레벨테스트 / 희망 일정 / 등록 상태
                    <small>현재 서비스 실제 화면 캡처로 교체 예정</small>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.fg}>
            {featureCards.map((card) => (
              <div key={card.title.join(" ")}>
                <h4>
                  {card.title[0]}
                  <br />
                  {card.title[1]}
                </h4>
                <p>{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.sec} ${styles.featureFollowSection}`}>
        <div className={`${styles.wrap} ${styles.fmid}`}>
          <div className={styles.shotpanel}>
            <div className={styles.shot}>
              <div className={styles.shotBar}>
                <i className={styles.dot} />
                <i className={styles.dot} />
                <i className={styles.dot} />
              </div>
              <div className={styles.shotPh}>
                <span>
                  <strong>실제 제품 캡처 영역 ②</strong>
                  <br />
                  예약 일정 / 신청 상태 / 알림 관리 화면
                  <small>현재 서비스 실제 화면 캡처로 교체 예정</small>
                </span>
              </div>
            </div>
          </div>
          <div>
            <p className={styles.fLbl}>운영 관리</p>
            <h3>
              오늘 처리해야 할 일이
              <br />
              먼저 보입니다
            </h3>
            <p>
              새 신청부터 등록 확인이 필요한 학생까지, 지금 확인해야 할 일을 한 화면에서
              보여드립니다.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.sec} ${styles.alt}`} id="compare">
        <div className={styles.wrap}>
          <p className={styles.kick}>지금과 뭐가 다른가</p>
          <h2 className={styles.sectionHeading}>
            학생 한 명이 지나가는 길을
            <br />
            나란히 놓아봤습니다
          </h2>
          <p className={styles.sub}>
            같은 학생이 체험 문의부터 다음 학기까지 어떻게 남는지 비교했습니다.
          </p>

          <div className={styles.tracks}>
            <div className={styles.tkHead}>
              <div className={styles.tkHeadLeft}>지금 · 전화 · 카톡 · 수첩</div>
              <div className={styles.tkHeadCenter}>시점</div>
              <div className={styles.tkHeadRight}>첫수업</div>
            </div>

            {compareRows.map((row) => (
              <div
                key={row.moment + row.currentTitle}
                className={`${styles.tkRow} ${row.isFinal ? styles.tkRowFinal : ""}`}
              >
                <div className={styles.tkL}>
                  <h5>{row.currentTitle}</h5>
                  <p>{row.currentDescription}</p>
                  {row.isFinal ? <span className={styles.tkEndMuted}>여기서 끝납니다</span> : null}
                </div>
                <div className={styles.tkC}>
                  <span>{row.moment}</span>
                </div>
                <div className={styles.tkR}>
                  <h5>{row.partnerTitle}</h5>
                  <p>{row.partnerDescription}</p>
                  {row.isFinal ? <span className={styles.tkEndGreen}>여기서 다시 시작합니다</span> : null}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.compareCards}>
            {compareRows.map((row) => (
              <article
                key={`mobile-${row.moment}-${row.currentTitle}`}
                className={`${styles.compareCard} ${row.isFinal ? styles.compareCardFinal : ""}`}
              >
                <h3 className={styles.compareCardTitle}>{row.moment}</h3>

                <div className={styles.compareCardBlock}>
                  <span className={`${styles.compareBadge} ${styles.compareBadgeMuted}`}>지금</span>
                  <h4>{row.currentTitle}</h4>
                  <p>{row.currentDescription}</p>
                  {row.isFinal ? (
                    <span className={styles.compareCardConclusionMuted}>여기서 끝납니다</span>
                  ) : null}
                </div>

                <div className={styles.compareCardDivider} />

                <div className={styles.compareCardBlock}>
                  <span className={`${styles.compareBadge} ${styles.compareBadgeGreen}`}>첫수업</span>
                  <h4>{row.partnerTitle}</h4>
                  <p>{row.partnerDescription}</p>
                  {row.isFinal ? (
                    <span className={styles.compareCardConclusionGreen}>여기서 다시 시작합니다</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sec} id="price">
        <div className={styles.wrap}>
          <p className={styles.kick}>요금</p>
          <h2 className={styles.sectionHeading}>파일럿 기간에는 받지 않습니다</h2>
          <p className={styles.sub}>
            정식 요금은 파일럿에서 실제 효과를 확인한 뒤 결정합니다.
          </p>

          <div className={styles.price}>
            <div className={`${styles.pc} ${styles.pcMain}`}>
              <p className={styles.pK}>BASIC</p>
              <p className={styles.pN}>학원 한 곳 기준</p>
              <div className={styles.pA}>
                <span className={styles.pFree}>파일럿 무료</span>
                <span className={styles.pSoon}>정식 요금 준비 중</span>
              </div>
              <ul className={styles.pList}>
                {pricingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className={styles.pc}>
              <p className={styles.pK}>ADD-ON</p>
              <p className={styles.pN}>필요하실 때만</p>
              <ul className={`${styles.pList} ${styles.pListAddOn}`}>
                {addOnItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className={styles.note}>부가 옵션 요금도 정식 요금과 함께 안내드리겠습니다.</p>
            </div>
          </div>
          <p className={styles.note}>정식 전환 조건과 요금은 파일럿 종료 전에 파트너 학원에 먼저 안내드립니다.</p>
        </div>
      </section>

      <section className={styles.cta} id="apply">
        <div className={styles.wrap}>
          <h2>
            첫수업의 초기 파일럿을
            <br />
            함께 검증할 학원을 찾습니다
          </h2>
          <p>초기 파일럿 파트너와 함께 실제 운영 데이터를 검증하고 있습니다.</p>

          <div className={styles.ctaIn}>
            <div className={styles.perks}>
              {perks.map((perk) => (
                <div key={perk.title}>
                  <b>{perk.title}</b>
                  <span>{perk.description}</span>
                </div>
              ))}
            </div>

            <div className={styles.formcard}>
              <h3>우리 학원에도 맞는지 확인해보세요</h3>
              <p>
                학원명과 연락처를 남겨주시면 현재 운영 방식에 첫수업을 어떻게 연결할 수 있는지
                안내드립니다.
              </p>
              <PartnerInquiryForm />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.sec} id="faq">
        <div className={styles.wrap}>
          <p className={styles.kick}>자주 묻는 질문</p>
          <h2 className={styles.sectionHeading}>원장님들이 가장 많이 물어보시는 것</h2>
          <div className={styles.faq}>
            {faqItems.map((item, index) => (
              <details key={item.question} className={styles.qa} open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.ft}>
        <div className={styles.wrap}>
          <div className={styles.ftTop}>
            <div>
              <Image
                src="/images/first-class-logo.png"
                alt="첫수업"
                width={93}
                height={30}
                className={styles.ftLogoImage}
              />
              <p className={styles.ftIntro}>
                체험수업 신청부터 상담 기록과 등록까지, 학원 운영을 한곳에서.
                <br />
                Try First, Choose Right.
              </p>
            </div>
            <div>
              <h5>바로가기</h5>
              <p>
                <a href="#why">왜 필요한가</a>
                <br />
                <a href="#link">도입 방식</a>
                <br />
                <a href="#compare">기존 방식과 비교</a>
                <br />
                <a href={TALLY_URL}>파일럿 상담</a>
              </p>
            </div>
            <div>
              <h5>고객센터</h5>
              <p className={styles.tnum}>
                010-8384-0825
                <br />
                hello@firstsuup.com
                <br />
                평일 09:00 – 18:00
                <br />
                (주말·공휴일 휴무)
              </p>
            </div>
          </div>
          <div className={styles.ftBot}>
            첫수업 · 대표 김원식 · 사업자등록번호 775-07-03279
            <br />
            경기도 고양시 일산동구 무궁화로 20-38, 5층 500-17호 (장항동, 골레오빌)
            <br />
            <br />© 2026 첫수업. All Rights Reserved.
          </div>
        </div>
      </footer>
    </main>
  )
}
