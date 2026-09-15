import Link from "next/link"

import styles from "../../../../app/record/page.module.css"

// 기록 화면의 하단 탭. Parent Home 과 같은 4개 탭을 쓴다 —
// 화면마다 탭 구성이 달라지면 같은 앱이 아니게 된다.
export const RecordBottomNav = () => {
  return (
    <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href="/classes" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/favorites" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href="/record" className={`${styles.navItem} ${styles.navItemActive}`} aria-current="page">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>기록</span>
        </Link>
        <Link href="/my" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M20 21a8 8 0 1 0-16 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>마이페이지</span>
        </Link>
      </nav>
  )
}
