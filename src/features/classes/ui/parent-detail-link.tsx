"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, type ComponentProps } from "react"
import { parentDetailHref } from "../lib/parent-navigation"

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string }
function ContextLink({ href, ...props }: Props) {
  const pathname = usePathname() ?? "/"
  const query = useSearchParams().toString()
  return <Link {...props} href={parentDetailHref(href, `${pathname}${query ? `?${query}` : ""}`)} />
}
/** Explicit return URL, rather than assuming history contains a safe previous page. */
export function ParentDetailLink(props: Props) {
  return <Suspense fallback={<Link {...props} />}><ContextLink {...props} /></Suspense>
}
