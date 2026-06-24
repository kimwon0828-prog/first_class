"use client"

import { useFormStatus } from "react-dom"

import styles from "./academy-update-requests.module.css"

type ReviewSubmitButtonProps = {
  idleLabel: string
  pendingLabel: string
  variant: "approve" | "reject"
}

export function ReviewSubmitButton({
  idleLabel,
  pendingLabel,
  variant
}: ReviewSubmitButtonProps) {
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
