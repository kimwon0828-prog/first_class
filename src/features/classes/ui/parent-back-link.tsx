"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, type ReactNode } from "react"
import { safeParentReturnTo, withParentChild } from "../lib/parent-navigation"

import { attachParentBackEntry, canUseParentHistoryBack } from "../lib/parent-navigation-history"

type Props = { href: string; className?: string; label: string; children: ReactNode }
function ContextBack({ href, label, ...props }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()
  const returnTo = safeParentReturnTo(params.get("returnTo"))
  const destination = returnTo && returnTo.split("?")[0].split("#")[0] !== pathname
    ? returnTo : withParentChild(href, params.get("child"))
  useEffect(() => { attachParentBackEntry() }, [pathname, params])
  return <Link {...props} href={destination} aria-label={label} onClick={event => {
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && canUseParentHistoryBack(destination)) {
      event.preventDefault()
      router.back()
    }
  }} />
}
export function ParentBackLink({ label, ...props }: Props) {
  return <Suspense fallback={<Link {...props} aria-label={label} />}><ContextBack {...props} label={label} /></Suspense>
}
