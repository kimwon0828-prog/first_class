"use client"

import { useState, type ReactNode } from "react"

import type { RecontactPanelContext } from "@/features/students/lib/recontact-gate"
import { RecontactPanel, type RecontactRecipient } from "@/features/students/ui/recontact-panel"
import { v2ButtonClassName, type V2ButtonSize, type V2ButtonVariant } from "@/features/studio/ui/v2/v2-button"
import { V2Dialog } from "@/features/studio/ui/v2/v2-dialog"
import type { RecontactTemplateKind } from "@/shared/lib/db/adapter"

type StudentSendLauncherProps = {
  context: RecontactPanelContext
  recipient: RecontactRecipient
  template: RecontactTemplateKind
  variant: V2ButtonVariant
  size: V2ButtonSize
  icon: ReactNode
  label: string
  fullWidth?: boolean
  /** 동의 안 함 · 엑셀 학생이면 누를 수 없다. */
  disabledReason?: string | null
}

/**
 * 학생 상세의 [문자] · [안내 보내기](§5.28). 받는 사람이 이 학생 한 명인 같은 보내기 패널을 V2Dialog(480)로 연다.
 * [문자]는 직접 쓰기, [안내 보내기]는 새 반 개설로 시작한다. 규칙 · 한도는 목록과 같다.
 */
export function StudentSendLauncher({ context, recipient, template, variant, size, icon, label, fullWidth, disabledReason }: StudentSendLauncherProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={v2ButtonClassName({ variant, size })}
        style={fullWidth ? { width: "100%" } : undefined}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? undefined}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <V2Dialog
          title={`${recipient.name} 보호자에게 안내 보내기`}
          description="스탠다드 · 광고성 정보 수신에 동의한 보호자에게만 가요."
          width={480}
          onClose={() => setOpen(false)}
        >
          <RecontactPanel context={context} recipients={[recipient]} initialTemplate={template} embedded />
        </V2Dialog>
      ) : null}
    </>
  )
}
