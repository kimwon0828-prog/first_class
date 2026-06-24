"use client"

import { useFormStatus } from "react-dom"

import styles from "./academy-approvals.module.css"

type ApprovalSubmitButtonProps = {
  idleLabel: string
  pendingLabel: string
  variant: "approve" | "reject"
}

export function ApprovalSubmitButton({
  idleLabel,
  pendingLabel,
  variant
}: ApprovalSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${styles.actionButton} ${
        variant === "approve" ? styles.actionButtonApprove : styles.actionButtonReject
      }`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
