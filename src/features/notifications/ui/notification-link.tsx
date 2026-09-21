"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, type ComponentProps } from "react"
import { markNotificationRead } from "../actions/mark-notification-read"

type Props = ComponentProps<typeof Link> & { notificationKey: string; isUnread?: boolean }
export function NotificationLink({ notificationKey, isUnread, ...props }: Props) {
  const router = useRouter()
  const inFlight = useRef(false)
  return <Link {...props} onClick={async event => {
    if (!isUnread) return
    // Preserve native modified-click/new-tab behavior while best-effort saving.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") {
      void markNotificationRead(notificationKey).catch(() => false)
      return
    }
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        markNotificationRead(notificationKey).catch(() => false),
        new Promise(resolve => { timer = setTimeout(resolve, 1500) })
      ])
    } finally {
      clearTimeout(timer)
      inFlight.current = false
      router.push(String(props.href))
    }
  }} />
}
