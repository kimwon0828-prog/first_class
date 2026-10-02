"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, type ComponentProps } from "react"
import { parentDetailHref } from "../lib/parent-navigation"
import { rememberParentNavigation } from "../lib/parent-navigation-history"
import { useParentLinkPrefetch } from "./use-parent-link-prefetch"

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string }
function ContextLink({ href, ...props }: Props) {
  const pathname = usePathname() ?? "/"
  const query = useSearchParams().toString()
  const destination = parentDetailHref(href, `${pathname}${query ? `?${query}` : ""}`)
  const { prefetch, prepare, cancel } = useParentLinkPrefetch(destination)
  return <Link {...props} href={destination} data-parent-detail-link
    prefetch={props.prefetch === false ? false : prefetch ?? props.prefetch}
    onPointerEnter={event => { props.onPointerEnter?.(event); if (!event.defaultPrevented && props.prefetch !== false) prepare() }}
    onTouchStart={event => { props.onTouchStart?.(event); if (!event.defaultPrevented && props.prefetch !== false) prepare() }}
    onFocus={event => { props.onFocus?.(event); if (!event.defaultPrevented && props.prefetch !== false) prepare() }}
    onNavigate={event => { cancel(); let cancelled = false; props.onNavigate?.({ preventDefault: () => { cancelled = true; event.preventDefault() } }); if (!cancelled && !props.replace) rememberParentNavigation(destination) }} />
}
/** Explicit return URL remains the fallback for bookmarks and external entry. */
export function ParentDetailLink(props: Props) {
  return <Suspense fallback={<Link {...props} />}><ContextLink {...props} /></Suspense>
}
