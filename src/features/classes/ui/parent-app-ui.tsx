import Image from "next/image"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

import { canOptimizeParentImage } from "@/features/classes/lib/parent-image"
import { APP_SUBJECT_CODES, type AppPriceInfo } from "@/features/classes/lib/app-presentation"

import { AppIcon, type AppIconName } from "./app-icon"
import ui from "./parent-app-ui.module.css"

// 학부모 앱 공통 부품의 웹 판(서버 컴포넌트에서 쓸 수 있다). 상호작용이 필요한 부품은 parent-app-ui-client.tsx.

export type ButtonVariant = "primary" | "secondary" | "tonal" | "dark" | "danger"
type ButtonLook = { variant?: ButtonVariant; size?: "large" | "medium"; caption?: string | null; children: ReactNode }

/** 앱 Button. href 가 있으면 링크, 없으면 button. */
export function AppButton({ variant = "primary", size = "large", caption, children, className, ...props }: ButtonLook & ComponentProps<"button">) {
  return <button type="button" {...props} className={`${ui.button} ${className ?? ""}`} data-variant={variant} data-size={size}>
    <span>{children}</span>{caption ? <span className={ui.buttonCaption}>{caption}</span> : null}
  </button>
}
export function AppButtonLink({ variant = "primary", size = "large", caption, children, className, disabled, ...props }: ButtonLook & ComponentProps<typeof Link> & { disabled?: boolean }) {
  return <Link {...props} className={`${ui.button} ${className ?? ""}`} data-variant={variant} data-size={size} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : props.tabIndex}>
    <span>{children}</span>{caption ? <span className={ui.buttonCaption}>{caption}</span> : null}
  </Link>
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "positive" | "warning" | "neutral" | "price" }) {
  return <span className={ui.badge} data-tone={tone}>{label}</span>
}

export const Band = () => <div className={ui.band} aria-hidden="true" />

export function AppSection({ title, right, children, id, className }: { title: string; right?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return <section className={`${ui.section} ${id ? ui.anchor : ""} ${className ?? ""}`} id={id} aria-label={title}>
    <div className={ui.sectionHead}><h2 className={ui.title}>{title}</h2>{right}</div>
    {children}
  </section>
}

/** 라벨 84 · 값. 값이 빈 줄은 그리지 않는다. */
export function InfoRows({ rows }: { rows: [string, ReactNode | null | undefined][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== "")
  if (!shown.length) return null
  return <dl className={ui.infoRows}>{shown.map(([label, value]) => <div key={label} className={ui.infoRow}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export function IconRow({ icon, label, children }: { icon: AppIconName; label?: string; children: ReactNode }) {
  return <div className={ui.iconRow}><AppIcon name={icon} size={16} />{label ? <span className={ui.iconRowLabel}>{label}</span> : null}<span className={ui.iconRowValue}>{children}</span></div>
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className={ui.disclosure}><summary>{title}<AppIcon name="chevron-down" size={20} /></summary><p>{children}</p></details>
}

/** 금액은 title·label 글자, 모르는 금액은 작은 회색 글자. 무료는 brand700. */
export function PriceText({ price, size = "label" }: { price: AppPriceInfo; size?: "title" | "label" }) {
  if (!price.known) return <span className={ui.unknownPrice}>{price.label}</span>
  return <span className={`${size === "title" ? ui.title : ui.label} ${price.free ? ui.free : ""}`}>{price.label}</span>
}

/** 앱 과목 선 아이콘(assets/subjects/*.svg). */
export function SubjectIcon({ code, size = 24 }: { code?: string | null; size?: number }) {
  const name = code && APP_SUBJECT_CODES.has(code) ? code : "other"
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/subjects/${name}.svg`} alt="" width={size} height={size} aria-hidden="true" />
}

function PublicImage({ src, alt, sizes, priority }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!canOptimizeParentImage(src)} style={{ objectFit: "cover" }} />
}

/** 학원 로고는 항상 원형. 없으면 과목 아이콘을 지름의 50%로. */
export function AcademyLogo({ src, size = 52, subjectCode, tone = "default" }: { src?: string | null; size?: 36 | 44 | 52 | 56; subjectCode?: string | null; tone?: "default" | "soft" }) {
  return <span className={ui.logo} data-tone={tone} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <PublicImage src={src} alt="" sizes={`${size}px`} /> : <SubjectIcon code={subjectCode} size={size / 2} />}
  </span>
}

/** 수업 사각 이미지. 없으면 과목 아이콘. */
export function ClassThumb({ src, subjectCode, size = 72, alt = "" }: { src?: string | null; subjectCode?: string | null; size?: number; alt?: string }) {
  return <span className={ui.thumb} style={{ width: size, height: size }}>
    {src ? <PublicImage src={src} alt={alt} sizes={`${size}px`} /> : <SubjectIcon code={subjectCode} size={size / 2} />}
  </span>
}

/** 화면 폭 전체 대표 이미지(수업 260 · 학원 220). */
export function Hero({ src, alt, subjectCode, kind = "class", children }: { src?: string | null; alt: string; subjectCode?: string | null; kind?: "class" | "academy"; children?: ReactNode }) {
  return <div className={ui.hero} data-size={kind}>
    {src ? <PublicImage src={src} alt={alt} sizes="(max-width: 480px) 100vw, 480px" priority /> : <SubjectIcon code={subjectCode} size={64} />}
    {children}
  </div>
}

export function AppLoading({ label = "불러오는 중" }: { label?: string }) {
  return <div className={ui.loading} role="status" aria-label={label}><span className={ui.spinner} aria-hidden="true" /></div>
}

/** 앱 Notice: 문구 + (다시 시도). retry 는 링크 주소. */
export function AppNotice({ message, retryHref, children }: { message: string; retryHref?: string; children?: ReactNode }) {
  return <div className={ui.notice} role="alert"><p className={ui.body}>{message}</p>
    {retryHref ? <AppButtonLink href={retryHref} variant="secondary">다시 시도</AppButtonLink> : null}
    {children}
  </div>
}

export function AppEmpty({ children }: { children: ReactNode }) {
  return <p className={ui.empty}>{children}</p>
}

export { ui as appUi }

/** 탭 화면 머리(일정 · 기록 · 마이). */
export function TabHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className={ui.tabHeader}><h1>{title}</h1>{children}</header>
}

/** 빈 화면(일정 · 기록 탭 공통): 원 64 아이콘 + 제목 + 설명 + 행동. */
export function EmptyState({ icon, title, body, action }: { icon: AppIconName; title: string; body: string; action?: ReactNode }) {
  return <section className={ui.emptyState}>
    <span className={ui.emptyIcon} aria-hidden="true"><AppIcon name={icon} size={26} /></span>
    <h2 className={ui.subtitle}>{title}</h2>
    <p className={ui.bodyMuted} style={{ whiteSpace: "pre-line" }}>{body}</p>
    {action}
  </section>
}

/** 진행 상황: 단계마다 완료 여부와 보조 문구. 다음 단계가 완료면 잇는 선도 채운다. */
export function Timeline({ steps }: { steps: [title: string, sub: string | null, done: boolean][] }) {
  return <ol className={ui.timeline}>{steps.map(([title, sub, done], index) => <li key={title} className={ui.timelineItem}>
    <span className={ui.timelineRail} aria-hidden="true">
      <span className={ui.timelineDot} data-done={done || undefined}>{done ? <AppIcon name="check" size={12} /> : null}</span>
      {index < steps.length - 1 ? <span className={ui.timelineLine} data-done={steps[index + 1][2] || undefined} /> : null}
    </span>
    <span className={ui.timelineText} data-done={done || undefined}><span>{title}{done ? <span className={ui.srOnly}> 완료</span> : null}</span>{sub ? <span className={ui.caption}>{sub}</span> : null}</span>
  </li>)}</ol>
}
