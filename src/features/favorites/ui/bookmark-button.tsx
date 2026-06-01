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
      {isFavorite ? <BookmarkFilledIcon size={iconSize} /> : <BookmarkOutlineIcon size={iconSize} />}
      {props.showLabel ? <span>{isFavorite ? activeLabel : inactiveLabel}</span> : null}
    </button>
  )
}
