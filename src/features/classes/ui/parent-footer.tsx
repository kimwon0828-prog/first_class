import Link from "next/link"
import Image from "next/image"

import styles from "./parent-footer.module.css"
import { COMPANY_ADDRESS, COMPANY_INFO } from "@/shared/config/company-info"


export function ParentFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brandRow}>
        <Image src="/images/first-class-logo.png" alt="첫수업" width={70} height={23} />
      </div>

      <nav className={styles.linkList} aria-label="푸터 링크">
        <Link href="/terms" className={styles.link}>
          이용약관
        </Link>
        <Link href="/privacy" className={styles.link}>
          개인정보처리방침
        </Link>
        <Link href="/third-party-consent" className={styles.link}>
          제3자 제공 동의
        </Link>
      </nav>

      <details className={styles.businessDetails}>
        <summary className={styles.summary}>사업자 정보</summary>
        <div className={styles.infoBlock}>
          <p className={styles.infoText}>상호명: {COMPANY_INFO.name}</p>
          <p className={styles.infoText}>대표자명: {COMPANY_INFO.representative}</p>
          <p className={styles.infoText}>
            사업자등록번호: {COMPANY_INFO.businessRegistrationNumber}
          </p>
          <p className={styles.infoText}>주소: {COMPANY_ADDRESS}</p>
          <p className={styles.infoText}>대표 이메일: {COMPANY_INFO.customerCenterEmail}</p>
          <p className={styles.infoText}>대표 연락처: {COMPANY_INFO.customerCenterPhone}</p>
        </div>
      </details>

      <p className={styles.notice}>
        첫수업은 학부모와 학원을 연결하는 플랫폼이며, 개별 수업 정보와 운영 내용은 각 학원 정책에
        따라 제공됩니다.
      </p>
      <p className={styles.copyright}>© First Class. All rights reserved.</p>
    </footer>
  )
}
