import Link from "next/link"

import { LEGAL_LINKS } from "@/shared/config/legal-links"

import styles from "./studio-mypage-page.module.css"

type LinkRowProps = {
  title: string
  description?: string
  href: string
}

const LinkRow = ({ title, description, href }: LinkRowProps) => (
  <Link href={href} prefetch={false} className={styles.row}>
    <span className={styles.rowText}>
      <span className={styles.rowTitle}>{title}</span>
      {description ? <span className={styles.rowDescription}>{description}</span> : null}
    </span>
    <span className={styles.rowChevron} aria-hidden="true">
      →
    </span>
  </Link>
)

type StudioMypagePageProps = {
  academyName: string
}

/**
 * 계정/학원 관리 화면.
 *
 * 여기서 값을 직접 고치지 않는다. 실제 수정 화면(프로필 수정 / 학원 설정)으로 보내기만 한다.
 * 정책 문서도 app/(legal)/* 를 그대로 링크한다 — Studio 안에 내용을 복사하지 않는다.
 */
export function StudioMypagePage({ academyName }: StudioMypagePageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>마이페이지</h1>
        <p className={styles.subtitle}>학원 정보와 정책 문서를 확인하세요.</p>
      </header>

      <section className={styles.section} aria-labelledby="mypage-academy-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="mypage-academy-title">
            학원
          </h2>
          <p className={styles.sectionDescription}>{academyName}</p>
        </div>

        <div className={styles.list}>
          <LinkRow
            title="프로필 수정"
            description="공개 페이지 링크와 학원 소개를 관리합니다."
            href="/studio/mypage/profile"
          />
          <LinkRow
            title="학원 설정"
            description="등록된 학원 정보를 확인하고 수정을 요청합니다."
            href="/studio/settings"
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="mypage-legal-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="mypage-legal-title">
            정책
          </h2>
        </div>

        <div className={styles.list}>
          {LEGAL_LINKS.map((link) => (
            <LinkRow key={link.href} title={link.label} href={link.href} />
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="mypage-account-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="mypage-account-title">
            계정
          </h2>
        </div>

        <div className={styles.list}>
          <Link href="/studio/sign-out" prefetch={false} className={styles.signOutRow}>
            로그아웃
          </Link>
        </div>
      </section>
    </div>
  )
}
