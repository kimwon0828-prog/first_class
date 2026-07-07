import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import styles from "./legal-page.module.css"

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
}

export function LegalPageLayout({
  eyebrow,
  title,
  description,
  notice,
  sections
}: LegalPageLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/classes" className={styles.brandLink} aria-label="첫수업 홈으로 이동">
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
              <p>시행일: 2026년 06월 25일</p>
              <p>최종 수정일: 2026년 07월 07일</p>
            </div>

            <div className={styles.businessBox}>
              <h2 className={styles.businessTitle}>사업자 정보</h2>
              <ul className={styles.businessList}>
                <li>상호명: 첫수업</li>
                <li>대표자명: 김원식</li>
                <li>사업자등록번호: 775-07-03279</li>
                <li>주소: 경기도 고양시 일산동구 무궁화로 20-38, 5층 500-17호(장항동, 로데오탑)</li>
                <li>대표 이메일: kimwon0828@naver.com</li>
                <li>대표 연락처: 01083840825</li>
              </ul>
            </div>
          </footer>
        </article>
      </div>
    </main>
  )
}
