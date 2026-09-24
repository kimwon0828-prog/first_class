"use client"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { ComponentProps } from "react"
import { resolveStudioDetailReturn } from "../lib/studio-detail-navigation"
import { useStudioInternalPathname, useStudioNavigationPathFactory } from "./studio-navigation-provider"

export function StudioDetailLink({ internalPath, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { internalPath: string }) {
  const pathname = useStudioInternalPathname()
  const params = useSearchParams()
  const studioPath = useStudioNavigationPathFactory()
  const back = resolveStudioDetailReturn(`${pathname}?${params.toString()}`)
  return <Link {...props} href={`${studioPath(internalPath)}?${new URLSearchParams({ returnTo: back.pathname + back.search })}`} />
}
