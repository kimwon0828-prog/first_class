"use client"

import type { ComponentProps } from "react"
import { StudioDetailLink } from "./studio-detail-link"

/** One native link owns row navigation, including Enter and modifier clicks. */
export function StudioCaseRowLink(props: ComponentProps<typeof StudioDetailLink>) {
  return <StudioDetailLink {...props} draggable={false} onClick={event => {
    const selection = window.getSelection()
    // Selecting a name/phone number to copy must not open the application.
    if (event.detail > 0 && selection && !selection.isCollapsed &&
      (event.currentTarget.contains(selection.anchorNode) || event.currentTarget.contains(selection.focusNode))) {
      event.preventDefault()
      return
    }
    props.onClick?.(event)
  }} />
}
