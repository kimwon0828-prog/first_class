import type { Metadata } from "next"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { ParentFaqList } from "@/features/my/ui/parent-faq-list"
import { COMPANY_EMAIL_HREF, COMPANY_INFO } from "@/shared/config/company-info"
import styles from "@/features/my/ui/parent-faq.module.css"

export const metadata: Metadata = { title: "자주 묻는 질문", alternates: { canonical: "/my/faq" } }

/** 앱 my/faq: 정적 안내라 로그인 없이도 본다. 고객센터 값은 company-info 한 곳에서 읽는다. */
export default function ParentFaqPage() {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <ParentHeader title="자주 묻는 질문" backHref="/my" />
    <div className={ui.content}>
      <ParentFaqList />
      <section className={styles.support} aria-label="고객센터">
        <div className={styles.supportText}>
          <p className={ui.label}>원하는 답이 없나요?</p>
          <p className={ui.caption}>고객센터 {COMPANY_INFO.customerCenterEmail}</p>
          <p className={ui.caption}>{COMPANY_INFO.customerCenterHours} · {COMPANY_INFO.customerCenterClosed}</p>
        </div>
        <a href={COMPANY_EMAIL_HREF} className={ui.button} data-variant="secondary" data-size="medium">이메일로 문의하기</a>
      </section>
    </div>
  </div></ParentAppShell>
}
