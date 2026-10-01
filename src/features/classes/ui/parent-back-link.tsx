"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { safeParentReturnTo, withParentChild } from "../lib/parent-navigation"

type Props = { href: string; className?: string; label: string; children: ReactNode }
function ContextBack({ href, label, ...props }: Props) {
  const params = useSearchParams()
  const pathname = usePathname()
  const returnTo = safeParentReturnTo(params.get("returnTo"))
  const destination = returnTo && returnTo.split("?")[0].split("#")[0] !== pathname
    ? returnTo : withParentChild(href, params.get("child"))
  return <Link {...props} href={destination} aria-label={label} />
}
export function ParentBackLink({ label, ...props }: Props) {
  return <Suspense fallback={<Link {...props} aria-label={label} />}><ContextBack {...props} label={label} /></Suspense>
}
