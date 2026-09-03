import Link from "next/link"

import { LEGAL_LINKS } from "@/shared/config/legal-links"

import styles from "./studio-workspace-footer.module.css"

/**
 * Studio 본문 맨 아래의 조용한 footer.
 *
 * 서버 컴포넌트다. 연도를 서버에서 한 번 계산해 hydration 이 필요 없게 한다.
 * 회사 정보는 정책 문서 하단(app/(legal)/legal-page-layout)이 canonical 이라 여기 옮겨 적지 않는다.
 */
export const StudioWorkspaceFooter = () => {
  const year = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <p className={styles.copyright}>© {year} 첫수업</p>

      <nav className={styles.links} aria-label="정책 문서">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.link}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
