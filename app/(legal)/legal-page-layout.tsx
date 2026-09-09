import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import styles from "./legal-page.module.css"
import { POC_DISCOVERY_HREF } from "@/shared/config/discovery"
import { COMPANY_ADDRESS, COMPANY_INFO } from "@/shared/config/company-info"

type LegalSection = {
  title: string
  body: ReactNode
}

type LegalPageLayoutProps = {
  eyebrow: string
  title: string
  description: string
  notice?: string
  sections: LegalSection[]
  /** 문서마다 다르다. 넘기지 않으면 기존 약관·방침의 날짜를 그대로 쓴다. */
  effectiveDate?: string
  /** 개정 이력이 없는 문서는 넘기지 않는다. 그러면 최종 수정일 줄을 그리지 않는다. */
  lastUpdatedDate?: string | null
}

export function LegalPageLayout({
  eyebrow,
  title,
  description,
  notice,
  sections,
  effectiveDate = "2026년 06월 25일",
  lastUpdatedDate = "2026년 07월 07일"
}: LegalPageLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={POC_DISCOVERY_HREF} className={styles.brandLink} aria-label="첫수업 홈으로 이동">
            <Image
              src="/images/first-class-logo.png"
              alt="첫수업"
              width={70}
              height={23}
              priority
            />
          </Link>
        </header>

        <article className={styles.article}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.description}>{description}</p>
            {notice ? <p className={styles.notice}>{notice}</p> : null}
          </div>

          <div className={styles.sectionList}>
            {sections.map((section) => (
              <section key={section.title} className={styles.section}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                <div className={styles.sectionBody}>{section.body}</div>
              </section>
            ))}
          </div>

          <footer className={styles.footer}>
            <div className={styles.dates}>
              <p>시행일: {effectiveDate}</p>
              {lastUpdatedDate ? <p>최종 수정일: {lastUpdatedDate}</p> : null}
            </div>

            <div className={styles.businessBox}>
              <h2 className={styles.businessTitle}>사업자 정보</h2>
              <ul className={styles.businessList}>
                <li>상호명: {COMPANY_INFO.name}</li>
                <li>대표자명: {COMPANY_INFO.representative}</li>
                <li>사업자등록번호: {COMPANY_INFO.businessRegistrationNumber}</li>
                <li>주소: {COMPANY_ADDRESS}</li>
                <li>대표 이메일: {COMPANY_INFO.representativeEmail}</li>
                <li>대표 연락처: {COMPANY_INFO.customerCenterPhone}</li>
              </ul>
            </div>
          </footer>
        </article>
      </div>
    </main>
  )
}
