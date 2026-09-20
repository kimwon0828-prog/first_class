"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { CSSProperties } from "react"
import { useEffect, useState, useTransition } from "react"

type ClassesSearchPillProps = {
  initialQuery: string
  placeholder: string
  className?: string
  pillClassName?: string
  inputClassName?: string
  /** 돋보기 submit 버튼용 class. */
  submitButtonClassName?: string
  /**
   * 검색 결과를 보여 줄 route.
   *
   * Home(/) 은 검색 화면이 아니라서 결과를 /classes 로 넘긴다. 지정하지 않으면
   * 지금 있는 화면에 그대로 머문다(= 검색 화면 안에서의 재검색).
   */
  targetPathname?: string
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  fontSize: 14,
  color: "#111827"
}

const pendingTextStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: "16px",
  color: "#2aad38",
  fontWeight: 700
}

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 21L16.65 16.65"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// 위치/legacy region 을 제외한 나머지 query 는 그대로 보존한다.
// legacy `region` 은 어떤 경우에도 다시 생성하지 않는다.
const buildHref = (
  pathname: string,
  current: URLSearchParams,
  next: {
    subjectCategory?: string | null
    subject?: string | null
    q?: string | null
    stage?: string | null
  }
) => {
  const params = new URLSearchParams(current.toString())
  params.delete("region")

  for (const [key, value] of Object.entries(next)) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }

  const queryString = params.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
}

export function ClassesSearchPill({
  initialQuery,
  placeholder,
  className,
  pillClassName,
  inputClassName,
  submitButtonClassName,
  targetPathname
}: ClassesSearchPillProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const [isPending, startTransition] = useTransition()

  /*
   * 적용된 검색어(URL)와 편집 중인 값(input)은 다른 것이다.
   *
   * 이 effect 는 밖에서 URL 이 바뀐 경우를 따라간다 — 뒤로/앞으로 가기,
   * Home 에서 ?q= 를 달고 들어오는 경우. 타이핑은 URL 을 건드리지 않으므로
   * 여기서 되감기는 일이 없다.
   */
  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  /*
   * 검색은 사용자가 실행할 때만 일어난다.
   *
   * ⚠️ 타이핑으로 검색하지 않는다. 글자마다 결과가 바뀌면 학부모는 다 치기도
   *    전에 "없어요" 를 여러 번 보게 되고, 한 글자 지울 때마다 history 가 흔들린다.
   *    돋보기 버튼과 Enter 만 검색이다.
   */
  const submitQuery = () => {
    const normalized = value.trim()
    const destination = targetPathname ?? pathname
    // q 만 set/delete 한다. 과목 · 지역 · 반경 등 나머지 조건은 그대로 실려 간다.
    const href = buildHref(destination, searchParams, { q: normalized || null })
    startTransition(() => {
      /*
       * 다른 화면으로 넘어가는 검색은 push 다.
       *
       * replace 로 넘기면 Home 이 history 에서 사라져 뒤로 가기가 Home 을
       * 건너뛴다. 같은 화면 안에서 검색어만 고치는 경우에만 replace 다.
       */
      if (destination !== pathname) {
        router.push(href)
        return
      }

      router.replace(href)
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submitQuery()
      }}
      className={className}
      role="search"
      aria-busy={isPending}
    >
      <div className={pillClassName}>
        <input
          value={value}
          onChange={(event) => {
            // 입력만 한다. 여기서 router 를 호출하지 않는다.
            setValue(event.target.value)
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          inputMode="search"
          enterKeyHint="search"
          className={inputClassName}
          style={inputClassName ? undefined : { ...inputStyle, border: 0, padding: 0 }}
        />
        <button type="submit" aria-label="검색" className={submitButtonClassName}>
          <SearchIcon />
        </button>
      </div>
      {isPending ? (
        <span style={pendingTextStyle} role="status" aria-live="polite">
          불러오는 중...
        </span>
      ) : null}
    </form>
  )
}
