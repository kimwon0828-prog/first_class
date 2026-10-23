import type { DetailsHTMLAttributes, ReactNode } from "react"

import { V2ChevronRightIcon } from "./v2-icons"
import styles from "./v2-section.module.css"

type V2SectionProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title" | "children" | "open"> & {
  title: ReactNode
  /** 제목 앞 원 안의 글자(A, B, C …). 단계가 없는 화면에서는 생략한다. */
  letter?: string
  /** 접혀 있을 때 오른쪽에 보이는 입력 요약. */
  summary?: ReactNode
  /** 제목 옆 표시(예: 오류 "확인 필요"). 접힘 · 펼침 모두 보인다. */
  badge?: ReactNode
  /** 제목을 h2 로 그릴 때. 페이지 안 여러 섹션이 문서 구조를 가질 때 쓴다. */
  titleAs?: "span" | "h2"
  /** 제목 요소 id. aria-labelledby 로 섹션을 이름 붙일 때. */
  titleId?: string
  defaultOpen?: boolean
  bodyClassName?: string
  children: ReactNode
}

/**
 * 접이식 Section 카드 (Figma 2173:144 / 2173:916).
 *
 * 브라우저 기본 <details> 로 만든다 — JS 없이 열고 닫히고, 키보드(Enter · Space)와
 * 스크린리더의 펼침 상태가 따라온다. 열림 상태를 바깥에서 제어하지 않는다.
 * 화살표는 하나를 회전시켜 Figma 의 >(접힘) / v(펼침) 두 모양을 낸다.
 * id · data-* · aria-* 같은 나머지 속성은 <details> 에 그대로 붙는다.
 */
export const V2Section = ({
  title,
  letter,
  summary,
  badge,
  titleAs = "span",
  titleId,
  defaultOpen = false,
  className,
  bodyClassName,
  children,
  ...rest
}: V2SectionProps) => {
  const Title = titleAs
  return (
    <details className={[styles.section, className].filter(Boolean).join(" ")} open={defaultOpen} {...rest}>
      <summary className={styles.header}>
        {letter ? (
          <span className={styles.letter} aria-hidden="true">
            {letter}
          </span>
        ) : null}
        <span className={styles.titleWrap}>
          <Title id={titleId} className={styles.title}>
            {title}
          </Title>
          {badge}
        </span>
        {summary ? <span className={styles.summary}>{summary}</span> : null}
        <V2ChevronRightIcon className={styles.chevron} size={18} />
      </summary>
      <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </details>
  )
}
