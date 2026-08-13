"use client"

import type { CSSProperties, MouseEvent } from "react"
import { useEffect, useMemo, useState } from "react"

import { getFavoriteClassIds, toggleFavoriteClassId } from "@/features/favorites/lib/storage"

const BookmarkOutlineIcon = (props: { size: number }) => (
  <svg
    width={props.size}
    height={props.size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
)

const BookmarkFilledIcon = (props: { size: number }) => (
  <svg
    width={props.size}
    height={props.size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
      fill="currentColor"
    />
  </svg>
)

const HeartOutlineIcon = (props: { size: number }) => (
  <svg
    width={props.size}
    height={props.size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 20.5s-6.5-4.35-8.86-7.31C.96 10.47 1.2 6.7 4.36 4.7A5.23 5.23 0 0 1 12 6.43 5.23 5.23 0 0 1 19.64 4.7c3.16 2 3.4 5.77 1.22 8.49C18.5 16.15 12 20.5 12 20.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const HeartFilledIcon = (props: { size: number }) => (
  <svg
    width={props.size}
    height={props.size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 20.5s-6.5-4.35-8.86-7.31C.96 10.47 1.2 6.7 4.36 4.7A5.23 5.23 0 0 1 12 6.43 5.23 5.23 0 0 1 19.64 4.7c3.16 2 3.4 5.77 1.22 8.49C18.5 16.15 12 20.5 12 20.5Z"
      fill="currentColor"
    />
  </svg>
)

export function BookmarkButton(props: {
  classId: string
  className?: string
  activeClassName?: string
  style?: CSSProperties
  activeStyle?: CSSProperties
  iconSize?: number
  showLabel?: boolean
  inactiveLabel?: string
  activeLabel?: string
  onChange?: (isFavorite: boolean) => void
  variant?: "bookmark" | "heart"
}) {
  const [isFavorite, setIsFavorite] = useState(false)

  const updateFromStorage = useMemo(
    () => () => {
      const ids = getFavoriteClassIds()
      setIsFavorite(ids.includes(props.classId))
    },
    [props.classId]
  )

  useEffect(() => {
    updateFromStorage()

    const onUpdated = () => updateFromStorage()
    window.addEventListener("firstclass_favorites_updated", onUpdated)
    window.addEventListener("storage", onUpdated)
    return () => {
      window.removeEventListener("firstclass_favorites_updated", onUpdated)
      window.removeEventListener("storage", onUpdated)
    }
  }, [updateFromStorage])

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const result = toggleFavoriteClassId(props.classId)
    setIsFavorite(result.isFavorite)
    props.onChange?.(result.isFavorite)
  }

  const className = `${props.className ?? ""} ${isFavorite ? props.activeClassName ?? "" : ""}`.trim()
  const iconSize = props.iconSize ?? 18
  const variant = props.variant ?? "bookmark"
  const inactiveLabel = props.inactiveLabel ?? "관심수업 추가"
  const activeLabel = props.activeLabel ?? "관심수업 저장됨"
  const style: CSSProperties | undefined = isFavorite
    ? { ...(props.style ?? {}), ...(props.activeStyle ?? {}) }
    : props.style

  return (
    <button
      type="button"
      aria-label={isFavorite ? "관심수업 해제" : "관심수업 추가"}
      className={className}
      style={style}
      onClick={onClick}
    >
      {variant === "heart" ? (
        isFavorite ? <HeartFilledIcon size={iconSize} /> : <HeartOutlineIcon size={iconSize} />
      ) : isFavorite ? (
        <BookmarkFilledIcon size={iconSize} />
      ) : (
        <BookmarkOutlineIcon size={iconSize} />
      )}
      {props.showLabel ? <span>{isFavorite ? activeLabel : inactiveLabel}</span> : null}
    </button>
  )
}
