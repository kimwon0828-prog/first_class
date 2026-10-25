"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { getEucKrByteLength } from "@/features/notifications/sms/byte-utils"
import { sendSms } from "@/features/notifications/sms/sender"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getRecontactBlockNotice, resolveRecontactBlock } from "@/features/students/lib/recontact-gate"
import {
  buildRecontactBodyTemplate,
  isRecontactTemplateKind,
  RECONTACT_CUSTOM_MAX,
  RECONTACT_LMS_MAX_BYTES,
  RECONTACT_PER_BATCH,
  RECONTACT_SENDER_PHONE,
  renderRecontactMessage
} from "@/features/students/lib/recontact-message"
import { buildTrialLabel } from "@/features/students/lib/student-grouping"
import { resolveStudioStudentGroup } from "@/features/students/queries/get-studio-students"
import { getLocalMutationGuard, getRecontactOptOutNumber } from "@/shared/config/server-env"
import { toParentUrl } from "@/shared/config/site-origins"
import { dataAdapter } from "@/shared/lib/db"
import type { RecontactDeliveryResult, RecontactTemplateKind, StudioApplicationSummary } from "@/shared/lib/db/adapter"

export type SendRecontactInput = {
  /** 화면이 만든 발송 id. 같은 id 로 다시 누르면 DB 가 duplicate 로 돌려준다(두 번 나가지 않는다). */
  batchId: string
  /** 고른 학생의 대표 신청 id. 전화번호 · 동의는 받지 않는다 — 서버가 다시 고른다. */
  applicationIds: string[]
  templateKind: RecontactTemplateKind
  classId: string | null
  customText: string
}

export type SendRecontactResult = {
  status: "success" | "partial" | "error"
  message: string
  /** 다음에 할 일(플랜·결제 등). */
  action?: { label: string; href: string } | null
  sent?: number
  failed?: number
  /** 문자 차단 스위치가 꺼져 실제로 가지 않은 수. */
  dryRun?: number
  /** 동의 · 080 · 같은 번호로 서버가 뺀 수. */
  skipped?: number
  /** [보내지 못한 M명 다시 보내기]용. */
  failedApplicationIds?: string[]
  /** 이번 달 남은 발송. */
  remaining?: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEND_CONCURRENCY = 5

const RESERVE_ERRORS: Record<string, string> = {
  recontact_plan_required: "학원 소식 보내기는 스탠다드 플랜에서 쓸 수 있어요.",
  recontact_no_eligible_recipient: "보낼 수 있는 보호자가 없어 보내지 않았어요. 학원 소식 수신 동의 · 휴대폰 인증 상태를 다시 확인해 주세요.",
  recontact_recipient_count_invalid: `한 번에 ${RECONTACT_PER_BATCH}명까지 보낼 수 있어요.`,
  recontact_class_forbidden: "함께 보낼 수업을 다시 골라 주세요.",
  recontact_batch_conflict: "화면을 새로 고친 뒤 다시 보내 주세요."
}

/**
 * 학생에게 학원 소식 보내기(다시 연락 문자). AGENTS.md "학생 · 학원 소식 문자".
 * 보내는 주체는 첫수업이다: 첫 줄 "(광고) [첫수업] 고객센터 번호", 둘째 줄부터 "[학원명] …".
 *
 * 확인 순서: 학원 계정 → 스탠다드 → 로컬 가드 → 080 번호 → 시간(08~21시 KST) → 입력
 * → 자리 잡기 RPC(스탠다드 · 첫수업 학원 소식 동의 · 계정 번호 · 080 · 파기 · 같은 번호 · 1회 50명 · 월 200건 · 중복 클릭)
 * → 받는 사람마다 학부모 계정 번호로 보내기 → 결과 기록. 보내지 못한 건 · dry_run 은 한도에서 빠진다.
 * 080 거부로 NCP 가 걸러낸 건은 매일 동기화(/api/cron/marketing-opt-out-sync)가 opted_out 으로 바꾼다.
 */
export async function sendRecontactAction(input: SendRecontactInput): Promise<SendRecontactResult> {
  const teacher = await requireTeacherStudioAccess()
  const organizationId = teacher.organizationId
  const now = new Date()

  const gate = await requireStudioEntitlement(organizationId, "canSendRecontactMessages")
  let sender: Awaited<ReturnType<typeof dataAdapter.getStudioRecontactSender>>
  try {
    sender = await dataAdapter.getStudioRecontactSender(organizationId)
  } catch {
    return { status: "error", message: "학원 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
  const optOutNumber = getRecontactOptOutNumber()
  const ids = Array.isArray(input.applicationIds) ? Array.from(new Set(input.applicationIds.filter((id) => typeof id === "string"))) : []

  const block = resolveRecontactBlock({
    entitled: gate.allowed,
    localGuardAllowed: getLocalMutationGuard().allowed,
    optOutNumber,
    now,
    selectedCount: ids.length,
    // 한도는 DB 가 transaction 안에서 다시 센다. 여기서는 막지 않는다.
    remaining: Number.POSITIVE_INFINITY
  })
  if (block) {
    const notice = getRecontactBlockNotice(block, 0)
    return { status: "error", message: notice.message, action: notice.action }
  }

  if (!UUID.test(String(input.batchId)) || !isRecontactTemplateKind(input.templateKind)) {
    return { status: "error", message: "화면을 새로 고친 뒤 다시 보내 주세요." }
  }
  const customText = String(input.customText ?? "").trim()
  if (input.templateKind === "custom" && (customText.length === 0 || customText.length > RECONTACT_CUSTOM_MAX)) {
    return { status: "error", message: `보낼 내용을 ${RECONTACT_CUSTOM_MAX}자 안으로 적어 주세요.` }
  }

  // 함께 보낼 수업: 이 학원의 공개 수업만.
  let classTitle: string | null = null
  if (input.classId) {
    try {
      const classes = await dataAdapter.listStudioClasses(organizationId)
      const found = classes.find((item) => item.id === input.classId && item.isActive && !item.archivedAt)
      if (!found) return { status: "error", message: RESERVE_ERRORS.recontact_class_forbidden }
      classTitle = found.title
    } catch {
      return { status: "error", message: "수업 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }
    }
  }

  // 고른 학생: 이 학원 학생의 대표 신청이어야 한다.
  const applicationById = new Map<string, StudioApplicationSummary>()
  try {
    for (const id of ids) {
      const group = await resolveStudioStudentGroup(organizationId, id)
      if (!group || group.representative.id !== id) {
        return { status: "error", message: "학생 목록이 바뀌었어요. 화면을 새로 고친 뒤 다시 골라 주세요." }
      }
      applicationById.set(id, group.representative)
    }
  } catch {
    return { status: "error", message: "학생 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  const bodyTemplate = buildRecontactBodyTemplate({ kind: input.templateKind, classTitle, customText })
  const linkUrl = input.classId ? toParentUrl(`/classes/${input.classId}`) : null

  let reserved: Awaited<ReturnType<typeof dataAdapter.reserveRecontactBatch>>
  try {
    reserved = await dataAdapter.reserveRecontactBatch(organizationId, {
      batchId: input.batchId,
      applicationIds: ids,
      templateKind: input.templateKind,
      classId: input.classId,
      bodyTemplate,
      linkUrl,
      optOutNumber: optOutNumber as string,
      senderPhone: RECONTACT_SENDER_PHONE
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return { status: "error", message: RESERVE_ERRORS[code] ?? "학원 소식을 보내지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  if (reserved.mode === "duplicate") {
    return { status: "success", message: "이미 보낸 학원 소식이에요. 학생 상세의 연락 기록에서 확인할 수 있어요." }
  }
  if (reserved.mode === "limit_exceeded") {
    const remaining = Math.max(0, reserved.limit - reserved.used)
    return { status: "error", message: getRecontactBlockNotice("limit", remaining).message, remaining }
  }

  // 받는 번호 = 학부모 계정 번호(DB 가 자리 잡을 때 고른 번호). 신청서 번호로는 보내지 않는다.
  let phoneByRecipient: Map<string, string | null>
  try {
    const phones = await dataAdapter.listRecontactRecipientPhones(organizationId, input.batchId)
    phoneByRecipient = new Map(phones.map((item) => [item.recipientId, item.phone]))
  } catch {
    phoneByRecipient = new Map()
  }

  // 받는 사람마다 보낸다(동시에 5통씩). 문자 차단 스위치가 꺼져 있으면 sendSms 가 dry_run 으로 돌려준다.
  const results: RecontactDeliveryResult[] = []
  const queue = [...reserved.recipients]
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const application = applicationById.get(next.applicationId)
      const phone = phoneByRecipient.get(next.recipientId) ?? null
      if (!application || !phone) {
        results.push({ recipientId: next.recipientId, status: "failed", providerMessageId: null, errorCode: application ? "recipient_phone_unresolved" : "recipient_unresolved", sentAt: null })
        continue
      }
      const message = renderRecontactMessage({
        academyName: sender.academyName,
        bodyTemplate,
        studentName: application.childName,
        trialLabel: buildTrialLabel(application),
        linkUrl,
        optOutNumber: optOutNumber as string
      })
      if (getEucKrByteLength(message) > RECONTACT_LMS_MAX_BYTES) {
        results.push({ recipientId: next.recipientId, status: "failed", providerMessageId: null, errorCode: "message_too_long", sentAt: null })
        continue
      }
      const sent = await sendSms({
        recipientType: "parent",
        phone,
        messagePreview: message,
        contentType: "AD",
        subject: "(광고) [첫수업] 학원 소식"
      })
      results.push({
        recipientId: next.recipientId,
        status: sent.status === "sent" ? "sent" : sent.status === "dry_run" ? "dry_run" : "failed",
        providerMessageId: sent.providerMessageId,
        errorCode: sent.status === "sent" || sent.status === "dry_run" ? null : sent.errorMessage ?? "send_failed",
        sentAt: sent.status === "sent" ? sent.sentAt ?? new Date().toISOString() : null
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, worker))

  try {
    await dataAdapter.finishRecontactBatch(organizationId, input.batchId, results)
  } catch {
    // 발송은 이미 끝났다. 기록 실패로 다시 보내게 하지 않는다 — 남은 queued 는 한도에 그대로 남는다(보수적).
  }

  revalidatePath("/studio/students")
  for (const id of ids) revalidatePath(`/studio/students/${id}`)

  const recipientById = new Map(reserved.recipients.map((item) => [item.recipientId, item.applicationId]))
  const sent = results.filter((item) => item.status === "sent").length
  const dryRun = results.filter((item) => item.status === "dry_run").length
  const failedIds = results.filter((item) => item.status === "failed").map((item) => recipientById.get(item.recipientId)).filter((id): id is string => Boolean(id))
  const remaining = Math.max(0, reserved.limit - reserved.used + failedIds.length + dryRun)
  const delivered = sent + dryRun
  const skippedNote = reserved.skipped > 0 ? ` (학원 소식 수신 동의 · 휴대폰 인증 · 같은 번호로 ${reserved.skipped}명은 뺐어요)` : ""
  const dryRunNote = dryRun > 0 ? " 문자 차단 스위치가 꺼져 있어 실제로는 가지 않았어요(시험 발송)." : ""

  if (failedIds.length > 0) {
    return {
      status: delivered > 0 ? "partial" : "error",
      message: `${delivered}명 보냈어요 · ${failedIds.length}명은 보내지 못했어요.${skippedNote}${dryRunNote}`,
      sent, failed: failedIds.length, dryRun, skipped: reserved.skipped, failedApplicationIds: failedIds, remaining
    }
  }
  return {
    status: "success",
    message: `${delivered}명에게 보냈어요.${skippedNote}${dryRunNote}`,
    sent, failed: 0, dryRun, skipped: reserved.skipped, failedApplicationIds: [], remaining
  }
}
