import Link from "next/link"

import styles from "./studio-mypage-page.module.css"

type SettingRowProps = {
  title: string
  href: string
  prefetch?: boolean
}

function SettingRow({ title, href, prefetch = false }: SettingRowProps) {
  return (
    <Link href={href} prefetch={prefetch} className={styles.row}>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.rowChevron} aria-hidden="true">
        {">"}
      </span>
    </Link>
  )
}

type SettingGroup = {
  title: string
  rows: Array<{
    title: string
    href: string
  }>
}

const settingGroups: SettingGroup[] = [
  {
    title: "기타",
    rows: [{ title: "로그아웃", href: "/studio/sign-out" }]
  }
]

type StudioMypagePageProps = {
  academyName: string
}

export function StudioMypagePage({ academyName }: StudioMypagePageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>마이페이지</h1>
        </header>

        <section className={styles.section}>
          <Link href="/studio/mypage/profile" prefetch={false} className={styles.accountCard}>
            <span className={styles.accountName}>{academyName}</span>
            <span className={styles.accountAction}>
              프로필 수정
              <span className={styles.rowChevron} aria-hidden="true">
                {">"}
              </span>
            </span>
          </Link>
        </section>

        {settingGroups.map((group) => (
          <section key={group.title} className={styles.section} aria-label={group.title}>
            <h2 className={styles.groupTitle}>{group.title}</h2>
            <div className={styles.listCard}>
              {group.rows.map((row) => (
                <SettingRow key={row.href} title={row.title} href={row.href} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
