import Link from "next/link"

import {
  COMPANY_EMAIL_HREF,
  COMPANY_INFO,
  COMPANY_PHONE_HREF
} from "@/shared/config/company-info"
import { LEGAL_LINKS } from "@/shared/config/legal-links"

import styles from "./studio-workspace-footer.module.css"

/**
 * Studio 본문 맨 아래의 조용한 footer.
 *
 * 서버 컴포넌트다. 연도를 서버에서 한 번 계산해 hydration 이 필요 없게 한다.
 * 회사 / 고객센터 정보는 shared/config/company-info 하나만 본다 — 여기 다시 적지 않는다.
 */
export const StudioWorkspaceFooter = () => {
  const year = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.columns}>
        <section className={styles.column} aria-label="사업자 정보">
          <p className={styles.columnTitle}>{COMPANY_INFO.name}</p>
          <p className={styles.detail}>대표 {COMPANY_INFO.representative}</p>
          <p className={styles.detail}>
            사업자등록번호 {COMPANY_INFO.businessRegistrationNumber}
          </p>
          <p className={styles.detail}>
            {COMPANY_INFO.addressLine1}
            <br />
            {COMPANY_INFO.addressLine2}
          </p>
        </section>

        <section className={styles.column} aria-label="고객센터">
          <p className={styles.columnTitle}>고객센터</p>
          <p className={styles.detail}>
            <a href={COMPANY_PHONE_HREF} className={styles.contactLink}>
              {COMPANY_INFO.customerCenterPhone}
            </a>
          </p>
          <p className={styles.detail}>
            <a href={COMPANY_EMAIL_HREF} className={styles.contactLink}>
              {COMPANY_INFO.customerCenterEmail}
            </a>
          </p>
          <p className={styles.detail}>{COMPANY_INFO.customerCenterHours}</p>
          <p className={styles.detail}>{COMPANY_INFO.customerCenterClosed}</p>
        </section>
      </div>

      <nav className={styles.links} aria-label="정책 문서">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.link}>
            {link.label}
          </Link>
        ))}
      </nav>

      <p className={styles.copyright}>
        © {year} {COMPANY_INFO.name}
      </p>
    </footer>
  )
}
