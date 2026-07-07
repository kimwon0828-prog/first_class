"use client"

import Link from "next/link"
import Image from "next/image"

import styles from "./parent-footer.module.css"

export function ParentFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brandRow}>
        <Image src="/images/first-class-logo.png" alt="첫수업" width={70} height={23} />
      </div>

      <div className={styles.infoBlock}>
        <p className={styles.infoText}>상호명: 첫수업</p>
        <p className={styles.infoText}>대표자명: 김원식</p>
        <p className={styles.infoText}>사업자등록번호: 775-07-03279</p>
        <p className={styles.infoText}>
          주소: 경기도 고양시 일산동구 무궁화로 20-38, 5층 500-17호(장항동, 로데오탑)
        </p>
        <p className={styles.infoText}>대표 이메일: kimwon0828@naver.com</p>
        <p className={styles.infoText}>대표 연락처: 01083840825</p>
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

      <p className={styles.notice}>
        첫수업은 학부모와 학원을 연결하는 플랫폼이며, 개별 수업 정보와 운영 내용은 각 학원 정책에
        따라 제공됩니다.
      </p>
      <p className={styles.copyright}>© First Class. All rights reserved.</p>
    </footer>
  )
}
