import type { ReactNode } from "react"

/*
 * Studio v2 아이콘. path 는 Figma "0. 컴포넌트 v2" 의 Icon/* 원본 그대로다
 * (메뉴 아이콘은 viewBox 20, 버튼 안 아이콘은 Figma 가 내보낸 16 · 18, 나머지는 24 · stroke 1.8).
 *
 * 저장소에 icon 패키지가 없어서 기존 Studio 와 같은 방식(inline SVG + currentColor)으로 둔다.
 * Figma 는 상태마다 색을 칠한 SVG 를 따로 내보내지만(기본 #626966 / 선택 #1B7A26),
 * 여기서는 색을 CSS 가 정한다 — 같은 모양을 색만 다르게 두 벌 들고 있지 않는다.
 */
type IconProps = {
  className?: string
  /** 화면에 그려질 크기(px). 모양은 viewBox 기준이라 크기와 무관하다. */
  size?: number
}

const Svg = ({
  className,
  size,
  viewBox,
  children
}: IconProps & { viewBox: 14 | 16 | 18 | 20 | 24; children: ReactNode }) => (
  <svg
    className={className}
    width={size ?? viewBox}
    height={size ?? viewBox}
    viewBox={`0 0 ${viewBox} ${viewBox}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
)

/* ── 메뉴(viewBox 20) ─────────────────────────────────────────── */

export const V2HomeIcon = (props: IconProps) => (
  <Svg viewBox={20} {...props}>
    <path
      d="M2.5 8.75L10 2.5L17.5 8.75V16.6667C17.5 16.8877 17.4122 17.0996 17.2559 17.2559C17.0996 17.4122 16.8877 17.5 16.6667 17.5H12.5V12.5H7.5V17.5H3.33333C3.11232 17.5 2.90036 17.4122 2.74408 17.2559C2.5878 17.0996 2.5 16.8877 2.5 16.6667V8.75Z"
      strokeLinejoin="round"
    />
  </Svg>
)

export const V2InboxIcon = (props: IconProps) => (
  <Svg viewBox={20} {...props}>
    <path
      d="M3.33333 10.8333H6.66667L7.91667 13.3333H12.0833L13.3333 10.8333H16.6667M16.6667 10.8333L15.8333 4.16667H4.16667L3.33333 10.8333V15.8333H16.6667V10.8333Z"
      strokeLinejoin="round"
    />
  </Svg>
)

export const V2CalendarIcon = (props: IconProps) => (
  <Svg viewBox={20} {...props}>
    <path d="M5 4.16667H15C16.1506 4.16667 17.0833 5.09941 17.0833 6.25V15C17.0833 16.1506 16.1506 17.0833 15 17.0833H5C3.84941 17.0833 2.91667 16.1506 2.91667 15V6.25C2.91667 5.09941 3.84941 4.16667 5 4.16667Z" />
    <path d="M2.91667 8.33333H17.0833M6.66667 2.91667V5.41667M13.3333 2.91667V5.41667" strokeLinecap="round" />
  </Svg>
)

export const V2HelpIcon = (props: IconProps) => (
  <Svg viewBox={20} {...props}>
    <path d="M17.0833 10C17.0833 13.912 13.912 17.0833 10 17.0833C6.08798 17.0833 2.91667 13.912 2.91667 10C2.91667 6.08798 6.08798 2.91667 10 2.91667C13.912 2.91667 17.0833 6.08798 17.0833 10Z" />
    <path
      d="M7.91667 7.91667C7.91798 7.54137 8.02064 7.1734 8.2138 6.85164C8.40697 6.52987 8.68346 6.26626 9.01407 6.08865C9.34468 5.91105 9.71713 5.82605 10.0921 5.84263C10.467 5.85922 10.8305 5.97678 11.1441 6.18288C11.4577 6.38898 11.7099 6.67598 11.8739 7.01355C12.0379 7.35111 12.1076 7.72671 12.0758 8.10065C12.044 8.4746 11.9117 8.83299 11.693 9.13798C11.4743 9.44297 11.1773 9.68321 10.8333 9.83333C10.3333 10.0833 10 10.5833 10 11.1667V11.6667M10 14.1667V14.175"
      strokeLinecap="round"
    />
  </Svg>
)

export const V2GearIcon = (props: IconProps) => (
  <Svg viewBox={20} {...props}>
    <path d="M12.5 10C12.5 11.3807 11.3807 12.5 10 12.5C8.61929 12.5 7.5 11.3807 7.5 10C7.5 8.61929 8.61929 7.5 10 7.5C11.3807 7.5 12.5 8.61929 12.5 10Z" />
    <path
      d="M10 2.08333V4.58333M10 15.4167V17.9167M2.08333 10H4.58333M15.4167 10H17.9167M4.41667 4.41667L6.16667 6.16667M13.8333 13.8333L15.5833 15.5833M4.41667 15.5833L6.16667 13.8333M13.8333 6.16667L15.5833 4.41667"
      strokeLinecap="round"
    />
  </Svg>
)

/* ── 공용(viewBox 24) ─────────────────────────────────────────── */

export const V2ChevronDownIcon = (props: IconProps) => (
  <Svg viewBox={24} {...props}>
    <path d="M6 9L12 15L18 9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

export const V2ChevronRightIcon = (props: IconProps) => (
  <Svg viewBox={24} {...props}>
    <path d="M9 6L15 12L9 18" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

export const V2XIcon = (props: IconProps) => (
  <Svg viewBox={24} {...props}>
    <path d="M6 6L12 12M12 12L18 18M12 12L18 6M12 12L6 18" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

export const V2ChevronLeftIcon = (props: IconProps) => (
  <Svg viewBox={24} {...props}>
    <path d="M15 6L9 12L15 18" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

/* 버튼 안 아이콘(Figma 16 · 18 크기 원본). */
export const V2PlusIcon = (props: IconProps) => (
  <Svg viewBox={16} {...props}>
    <path d="M8 3.33333V8M8 8V12.6667M8 8H3.33333M8 8H12.6667" strokeLinecap="round" />
  </Svg>
)

export const V2InfoIcon = (props: IconProps) => (
  <Svg viewBox={18} {...props}>
    <path d="M15.375 9C15.375 12.5208 12.5208 15.375 9 15.375C5.47918 15.375 2.625 12.5208 2.625 9C2.625 5.47918 5.47918 2.625 9 2.625C12.5208 2.625 15.375 5.47918 15.375 9Z" />
    <path d="M9 8.25V12M9 6V6.0075" strokeLinecap="round" />
  </Svg>
)

/* 수업·일정 화면(Figma 2148:6043 · 2178:373) 에서 더한 아이콘. */
export const V2PencilIcon = (props: IconProps) => (
  <Svg viewBox={16} {...props}>
    <path
      d="M10.3333 3C10.5985 2.73478 10.9583 2.58579 11.3333 2.58579C11.7084 2.58579 12.0681 2.73478 12.3333 3C12.5985 3.26522 12.7475 3.62493 12.7475 4C12.7475 4.37507 12.5985 4.73478 12.3333 5L5.33333 12L2.66667 12.6667L3.33333 10L10.3333 3Z"
      strokeLinejoin="round"
    />
  </Svg>
)

/* Icon/check (2012:493) — Studio/Checkbox 켜짐 상태 안의 체크. */
export const V2CheckIcon = (props: IconProps) => (
  <Svg viewBox={14} {...props}>
    <path d="M2.91667 7.29167L5.54167 9.91667L11.0833 4.375" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

/* Icon/calendar (2002:53) — 날짜 입력 앞 아이콘. 메뉴의 V2CalendarIcon(viewBox 20)과 모양이 다르다. */
export const V2DateIcon = (props: IconProps) => (
  <Svg viewBox={24} {...props}>
    <path d="M6 5H18C19.3807 5 20.5 6.11929 20.5 7.5V18C20.5 19.3807 19.3807 20.5 18 20.5H6C4.61929 20.5 3.5 19.3807 3.5 18V7.5C3.5 6.11929 4.61929 5 6 5Z" />
    <path d="M3.5 10H20.5M8 3.5V6.5M16 3.5V6.5" strokeLinecap="round" />
  </Svg>
)
