"use client"

import { StudioClassForm, type StudioClassFormProps } from "./studio-class-form"

/** Compatibility entry point for callers that still use the former wizard name. */
export const StudioClassCreateWizard = (props: StudioClassFormProps) =>
  <StudioClassForm {...props} variant="standalone" />
