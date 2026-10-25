"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"

import { sendRecontactAction, type SendRecontactResult } from "@/features/students/actions/send-recontact"
import {
  getRecontactBlockNotice,
  resolveRecontactBlock,
  type RecontactPanelContext
} from "@/features/students/lib/recontact-gate"
import {
  buildRecontactBodyTemplate,
  estimateSmsBytes,
  formatRecontactHeader,
  formatRecontactLinkLine,
  formatRecontactOptOutLine,
  RECONTACT_CUSTOM_MAX,
  RECONTACT_PANEL_DESCRIPTION,
  RECONTACT_TEMPLATES,
  renderRecontactBody
} from "@/features/students/lib/recontact-message"
import { useStudioNavigationPathFactory } from "@/features/studio/ui/studio-navigation-provider"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2Chip } from "@/features/studio/ui/v2/v2-chip"
import { V2SendIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2Select } from "@/features/studio/ui/v2/v2-select"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import type { RecontactTemplateKind } from "@/shared/lib/db/adapter"

import styles from "./recontact-panel.module.css"

export type RecontactRecipient = { applicationId: string; name: string; trialLabel: string }

type RecontactPanelProps = {
  context: RecontactPanelContext
  recipients: RecontactRecipient[]
  initialTemplate?: RecontactTemplateKind
  /** 보낸 뒤(성공 · 일부 실패) 고른 학생을 비운다. */
  onSent?: () => void
  /** 학생 상세 팝업 안에서는 테두리 · 머리를 팝업이 맡는다. */
  embedded?: boolean
}

const newBatchId = () => crypto.randomUUID()

/**
 * 학원 소식 보내기 패널 (Figma 2148:5922). STUDIO_DESIGN_SYSTEM.md §5.27. 보내는 주체는 첫수업이다.
 * 막는 이유는 recontact-gate 가 정하고, 서버 액션이 같은 순서로 다시 본다.
 */
export function RecontactPanel({ context, recipients, initialTemplate = "new_class", onSent, embedded = false }: RecontactPanelProps) {
  const studioPath = useStudioNavigationPathFactory()
  const [template, setTemplate] = useState<RecontactTemplateKind>(initialTemplate)
  const [classId, setClassId] = useState("")
  const [customText, setCustomText] = useState("")
  const [batchId, setBatchId] = useState(newBatchId)
  const [result, setResult] = useState<SendRecontactResult | null>(null)
  const [remainingOverride, setRemainingOverride] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(() => new Date(context.checkedAt))
  // 두 번 빠르게 눌러도 요청은 하나만 나간다(버튼이 잠기기 전의 두 번째 클릭). 같은 발송 id 는 DB 도 막는다.
  const inFlight = useRef(false)

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const limit = context.usage?.limit ?? 200
  const remaining = remainingOverride ?? (context.usage ? Math.max(0, context.usage.limit - context.usage.used) : limit)
  const selectedClass = context.classes.find((item) => item.id === classId) ?? null
  const linkUrl = selectedClass ? `${context.classLinkBase}${selectedClass.id}` : null
  const previewRecipient = recipients[0] ?? { applicationId: "", name: "학생 이름", trialLabel: "체험 수업" }

  const bodyTemplate = useMemo(
    () => buildRecontactBodyTemplate({ kind: template, classTitle: selectedClass?.title ?? null, customText }),
    [template, selectedClass, customText]
  )
  const header = formatRecontactHeader()
  const body = renderRecontactBody(bodyTemplate, { academyName: context.academyName, studentName: previewRecipient.name, trialLabel: previewRecipient.trialLabel })
  const optOutLine = formatRecontactOptOutLine(context.optOutNumber ?? "080-…")
  const fullText = [header, body, "", ...(linkUrl ? [formatRecontactLinkLine(linkUrl)] : []), optOutLine].join("\n")

  const block = resolveRecontactBlock({
    entitled: context.entitled,
    localGuardAllowed: context.localGuardAllowed,
    optOutNumber: context.optOutNumber,
    now,
    selectedCount: recipients.length,
    remaining
  })
  const customMissing = template === "custom" && customText.trim().length === 0
  // 보낸 직후에는 고른 학생이 비어 있다. 결과 상자가 있으면 "골라 주세요"는 띄우지 않는다.
  const notice = block && !(block === "no_recipient" && result) ? getRecontactBlockNotice(block, remaining) : null

  const send = (applicationIds: string[]) => {
    if (inFlight.current) return
    inFlight.current = true
    startTransition(async () => {
      try {
        const response = await sendRecontactAction({ batchId, applicationIds, templateKind: template, classId: classId || null, customText })
        setResult(response)
        if (typeof response.remaining === "number") setRemainingOverride(response.remaining)
        if (response.status !== "error") onSent?.()
      } catch {
        setResult({ status: "error", message: "보내기를 마치지 못했어요. 연락 기록을 확인한 뒤 다시 보내 주세요." })
      } finally {
        // 다음 누름은 새 발송이다. 같은 발송 id 를 다시 쓰면 DB 가 중복으로 막는다.
        setBatchId(newBatchId())
        inFlight.current = false
      }
    })
  }

  const count = recipients.length
  return (
    <section
      className={embedded ? styles.embedded : styles.panel}
      aria-labelledby={embedded ? undefined : "recontact-panel-title"}
      aria-label={embedded ? "학원 소식 보내기" : undefined}
    >
      {/* 팝업 안에서는 제목 · 요금제 표시를 팝업 머리가 맡는다. */}
      {embedded ? null : (
        <div className={styles.headGroup}>
          <div className={styles.head}>
            <h2 id="recontact-panel-title" className={styles.title}>{count > 0 ? `${count}명에게 학원 소식 보내기` : "학원 소식 보내기"}</h2>
            <span className={styles.spacer} />
            <V2StatusBadge tone="green">스탠다드</V2StatusBadge>
          </div>
          <p className={styles.description}>{RECONTACT_PANEL_DESCRIPTION}</p>
        </div>
      )}

      <div className={styles.templates} role="group" aria-label="학원 소식 종류">
        {RECONTACT_TEMPLATES.map((item) => (
          <V2Chip key={item.kind} label={item.label} selected={template === item.kind} onClick={() => setTemplate(item.kind)} />
        ))}
      </div>

      {template === "custom" ? (
        <label className={styles.custom}>
          <span className={styles.customHead}>
            <span className={styles.customLabel}>보낼 내용</span>
            <span className={styles.customCount}>{customText.length} / {RECONTACT_CUSTOM_MAX}자</span>
          </span>
          <textarea
            value={customText}
            maxLength={RECONTACT_CUSTOM_MAX}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="예) 11월부터 토요일 오전 10시에 새 반이 열려요."
          />
        </label>
      ) : null}

      <V2Select
        label="함께 보낼 수업"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        options={[{ value: "", label: "수업 안 보내기" }, ...context.classes.map((item) => ({ value: item.id, label: item.title }))]}
      />

      <p className={styles.previewCaption}>미리보기 · {recipients[0] ? `${previewRecipient.name} 보호자님` : "예시"}</p>
      <div className={styles.message}>
        <p className={styles.messageBody}>{`${header}\n${body}`}</p>
        {linkUrl ? <p className={styles.messageLink}>{formatRecontactLinkLine(linkUrl)}</p> : null}
        <p className={styles.messageOptOut}>{optOutLine}</p>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>보내는 방법</dt>
          <dd>{estimateSmsBytes(fullText) <= 90 ? "문자(SMS)" : "문자(LMS)"} · 광고 표시</dd>
        </div>
        <div>
          <dt>받는 사람</dt>
          <dd>{count > 0 ? `${count}명 · 모두 학원 소식 수신 동의` : "고른 학생 없음"}</dd>
        </div>
        <div>
          <dt>이번 달 남은 발송</dt>
          <dd>{context.usage || remainingOverride !== null ? `${remaining} / ${limit}건` : "확인하지 못했어요"}</dd>
        </div>
      </dl>

      {notice ? (
        <div className={styles.notice} role="status">
          <p>{notice.message}</p>
          {notice.action ? <Link href={studioPath(notice.action.href)} className={styles.noticeLink}>{notice.action.label} ›</Link> : null}
        </div>
      ) : null}

      {result ? (
        <div className={result.status === "success" ? styles.resultOk : styles.resultWarn} role={result.status === "error" ? "alert" : "status"}>
          <p>{result.message}</p>
          {result.action ? <Link href={studioPath(result.action.href)} className={styles.noticeLink}>{result.action.label} ›</Link> : null}
          {result.failedApplicationIds && result.failedApplicationIds.length > 0 ? (
            <button
              type="button"
              disabled={pending || Boolean(block && block !== "no_recipient")}
              onClick={() => send(result.failedApplicationIds as string[])}
              className={v2ButtonClassName({ variant: "outline", size: "sm" })}
            >
              보내지 못한 {result.failedApplicationIds.length}명 다시 보내기
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={v2ButtonClassName({ variant: "primary", size: "lg", className: styles.sendButton })}
        disabled={pending || Boolean(block) || customMissing}
        onClick={() => send(recipients.map((item) => item.applicationId))}
      >
        <V2SendIcon size={18} />
        {pending ? "보내는 중…" : count > 0 ? `${count}명에게 보내기` : "학원 소식 보내기"}
      </button>
      <p className={styles.footnote}>학생 이름과 체험 수업이 자동으로 들어가요. 보낸 내용은 학생 기록에 남아요.</p>
    </section>
  )
}
