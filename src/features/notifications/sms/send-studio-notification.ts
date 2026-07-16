import "server-only"

import { sendSms } from "@/features/notifications/sms/sender"
import { renderSmsTemplate } from "@/features/notifications/sms/templates"
import type {
  AdminSmsEventType,
  SmsEventType,
  SmsRecipientType,
  SmsSendResult,
  TeacherSmsEventType
} from "@/features/notifications/sms/types"
import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

type StudioSmsApplicationContext = Omit<
  Pick<
    StudioApplicationDetail,
    | "id"
    | "classId"
    | "parentId"
    | "childName"
    | "parentName"
    | "parentPhone"
    | "classTitle"
    | "requestedSlotAt"
    | "confirmedSlotAt"
    | "selectedScheduleLabel"
    | "assignedTeacherId"
    | "assignedTeacherName"
  >,
  "classId" | "parentId"
> & {
  academyName?: string | null
  classId: string | null
  parentId: string | null
}

type TeacherRecipient = {
  recipientName: string | null
  recipientPhone: string | null
  teacherId: string | null
  smsEnabled: boolean
  errorMessage: string | null
}

type AdminRecipient = {
  recipientName: string | null
  recipientPhone: string | null
  errorMessage: string | null
}

type InsertSmsLogInput = {
  organizationId: string
  application: StudioSmsApplicationContext
  createdBy?: string | null
  recipientType: SmsRecipientType
  eventType: SmsEventType
  recipientName: string | null
  recipientPhoneMasked: string | null
  teacherId: string | null
  templateKey: SmsEventType
  messagePreview: string
  status: SmsSendResult["status"]
  provider: SmsSendResult["provider"]
  providerMessageId: string | null
  errorMessage: string | null
  sentAt: string | null
}

type SendStudioNotificationInput = {
  organizationId: string
  application: StudioSmsApplicationContext
  createdBy?: string | null
  teacherEventType: TeacherSmsEventType
  adminEventType: AdminSmsEventType
  targetTeacherId?: string | null
}

type StudioNotificationRecipientResult = {
  status: SmsSendResult["status"]
  errorMessage: string | null
  normalizedPhone: string | null
}

export type SendStudioNotificationResult = {
  teacher: StudioNotificationRecipientResult
  admin: StudioNotificationRecipientResult
}

const sanitizePreview = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim()
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}

const resolveTeacherDisplayName = (
  teacherDisplayName: string | null | undefined,
  profileName: string | null | undefined
) => teacherDisplayName?.trim() || profileName?.trim() || "선생님"

const buildSkippedResult = ({
  errorMessage,
  recipientPhone
}: {
  errorMessage: string
  recipientPhone: string | null
}): SmsSendResult => ({
  status: "skipped",
  provider: "dry_run",
  providerMessageId: null,
  errorMessage,
  recipientPhoneMasked: maskPhoneNumber(recipientPhone),
  sentAt: null
})

const resolveTeacherRecipient = async (
  organizationId: string,
  teacherId: string | null
): Promise<TeacherRecipient> => {
  if (!teacherId) {
    return {
      recipientName: null,
      recipientPhone: null,
      teacherId: null,
      smsEnabled: false,
      errorMessage: "teacher_not_assigned"
    }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("teachers")
    .select("id, organization_id, profile_id, display_name, phone, sms_enabled, is_active")
    .eq("id", teacherId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_teacher_sms_recipient")
  }

  if (!data) {
    return {
      recipientName: null,
      recipientPhone: null,
      teacherId,
      smsEnabled: false,
      errorMessage: "teacher_not_found"
    }
  }

  if (data.organization_id !== organizationId) {
    return {
      recipientName: resolveTeacherDisplayName(data.display_name, null),
      recipientPhone: data.phone?.trim() || null,
      teacherId: data.id,
      smsEnabled: Boolean(data.sms_enabled),
      errorMessage: "teacher_organization_mismatch"
    }
  }

  let profileName: string | null = null
  if (data.profile_id) {
    const { data: profileData, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("role, name")
      .eq("id", data.profile_id)
      .maybeSingle()

    if (profileError) {
      throw new Error("failed_to_fetch_teacher_sms_profile")
    }

    profileName = profileData?.name ?? null

    if (!profileData || profileData.role !== "teacher") {
      return {
        recipientName: resolveTeacherDisplayName(data.display_name, profileName),
        recipientPhone: data.phone?.trim() || null,
        teacherId: data.id,
        smsEnabled: Boolean(data.sms_enabled),
        errorMessage: "excluded_non_teacher_recipient"
      }
    }
  }

  if (!data.is_active) {
    return {
      recipientName: resolveTeacherDisplayName(data.display_name, profileName),
      recipientPhone: data.phone?.trim() || null,
      teacherId: data.id,
      smsEnabled: Boolean(data.sms_enabled),
      errorMessage: "teacher_inactive"
    }
  }

  return {
    recipientName: resolveTeacherDisplayName(data.display_name, profileName),
    recipientPhone: data.phone?.trim() || null,
    teacherId: data.id,
    smsEnabled: Boolean(data.sms_enabled),
    errorMessage: null
  }
}

const resolveAdminRecipient = async (organizationId: string): Promise<AdminRecipient> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select("name, representative_name, contact_phone, academy_phone")
    .eq("id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_admin_sms_recipient")
  }

  if (!data) {
    return {
      recipientName: null,
      recipientPhone: null,
      errorMessage: "organization_not_found"
    }
  }

  const recipientPhone = data.contact_phone?.trim() || data.academy_phone?.trim() || null
  if (!recipientPhone) {
    return {
      recipientName: data.representative_name?.trim() || data.name?.trim() || "학원 관리자",
      recipientPhone: null,
      errorMessage: "admin_phone_missing"
    }
  }

  return {
    recipientName: data.representative_name?.trim() || data.name?.trim() || "학원 관리자",
    recipientPhone,
    errorMessage: null
  }
}

const insertSmsLog = async ({
  organizationId,
  application,
  createdBy,
  recipientType,
  eventType,
  recipientName,
  recipientPhoneMasked,
  teacherId,
  templateKey,
  messagePreview,
  status,
  provider,
  providerMessageId,
  errorMessage,
  sentAt
}: InsertSmsLogInput) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { error } = await serviceRoleClient.from("sms_logs").insert({
    organization_id: organizationId,
    trial_application_id: application.id,
    class_id: application.classId ?? null,
    teacher_id: teacherId,
    recipient_type: recipientType,
    recipient_name: recipientName,
    recipient_phone_masked: recipientPhoneMasked,
    event_type: eventType,
    template_key: templateKey,
    message_preview: sanitizePreview(messagePreview),
    status,
    provider,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    created_by: createdBy ?? null,
    sent_at: sentAt
  })

  if (error) {
    throw new Error(`failed_to_insert_${recipientType}_sms_log`)
  }
}

const sendTeacherSms = async (input: SendStudioNotificationInput) => {
  const recipient = await resolveTeacherRecipient(
    input.organizationId,
    input.targetTeacherId ?? input.application.assignedTeacherId ?? null
  )

  const template = renderSmsTemplate({
    recipientType: "teacher",
    eventType: input.teacherEventType,
    context: {
      academyName: input.application.academyName?.trim() ?? null,
      classTitle: input.application.classTitle ?? null,
      childName: input.application.childName?.trim() ?? null,
      parentDisplayName: input.application.parentName?.trim() ?? null,
      scheduledAt: input.application.confirmedSlotAt ?? null,
      requestedAt: input.application.requestedSlotAt ?? null,
      selectedScheduleLabel: input.application.selectedScheduleLabel ?? null,
      assignedTeacherName: input.application.assignedTeacherName ?? null
    }
  })

  const sendResult =
    recipient.errorMessage === null
      ? await sendSms({
          recipientType: "teacher",
          phone: recipient.recipientPhone,
          smsEnabled: recipient.smsEnabled,
          messagePreview: template.messagePreview
        })
      : buildSkippedResult({
          errorMessage: recipient.errorMessage,
          recipientPhone: recipient.recipientPhone
        })

  await insertSmsLog({
    organizationId: input.organizationId,
    application: input.application,
    createdBy: input.createdBy ?? null,
    recipientType: "teacher",
    eventType: input.teacherEventType,
    recipientName: recipient.recipientName,
    recipientPhoneMasked: sendResult.recipientPhoneMasked,
    teacherId: recipient.teacherId,
    templateKey: template.templateKey,
    messagePreview: template.messagePreview,
    status: sendResult.status,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId,
    errorMessage: sendResult.errorMessage,
    sentAt: sendResult.sentAt
  })

  return {
    recipient,
    template,
    sendResult
  }
}

export const sendStudioNotification = async (
  input: SendStudioNotificationInput
): Promise<SendStudioNotificationResult> => {
  const teacherResult = await sendTeacherSms(input)
  const normalizedTeacherPhone =
    teacherResult.recipient.errorMessage === null
      ? normalizePhoneNumber(teacherResult.recipient.recipientPhone)
      : null

  const adminRecipient = await resolveAdminRecipient(input.organizationId)
  const normalizedAdminPhone =
    adminRecipient.errorMessage === null ? normalizePhoneNumber(adminRecipient.recipientPhone) : null
  const shouldSkipAdminDuplicate =
    normalizedTeacherPhone !== null &&
    normalizedAdminPhone !== null &&
    normalizedTeacherPhone === normalizedAdminPhone

  const template = renderSmsTemplate({
    recipientType: "admin",
    eventType: input.adminEventType,
    context: {
      academyName: input.application.academyName?.trim() ?? null,
      classTitle: input.application.classTitle ?? null,
      childName: input.application.childName?.trim() ?? null,
      parentDisplayName: input.application.parentName?.trim() ?? null,
      scheduledAt: input.application.confirmedSlotAt ?? null,
      requestedAt: input.application.requestedSlotAt ?? null,
      selectedScheduleLabel: input.application.selectedScheduleLabel ?? null,
      assignedTeacherName: input.application.assignedTeacherName ?? null
    }
  })

  const adminSendResult = shouldSkipAdminDuplicate
    ? buildSkippedResult({
        errorMessage: "skipped_duplicate_recipient_phone",
        recipientPhone: adminRecipient.recipientPhone
      })
    : adminRecipient.errorMessage === null
      ? await sendSms({
          recipientType: "admin",
          phone: adminRecipient.recipientPhone,
          messagePreview: template.messagePreview
        })
      : buildSkippedResult({
          errorMessage: adminRecipient.errorMessage,
          recipientPhone: adminRecipient.recipientPhone
        })

  await insertSmsLog({
    organizationId: input.organizationId,
    application: input.application,
    createdBy: input.createdBy ?? null,
    recipientType: "admin",
    eventType: input.adminEventType,
    recipientName: adminRecipient.recipientName,
    recipientPhoneMasked: adminSendResult.recipientPhoneMasked,
    teacherId: null,
    templateKey: template.templateKey,
    messagePreview: template.messagePreview,
    status: adminSendResult.status,
    provider: adminSendResult.provider,
    providerMessageId: adminSendResult.providerMessageId,
    errorMessage: adminSendResult.errorMessage,
    sentAt: adminSendResult.sentAt
  })

  return {
    teacher: {
      status: teacherResult.sendResult.status,
      errorMessage: teacherResult.sendResult.errorMessage,
      normalizedPhone: normalizedTeacherPhone
    },
    admin: {
      status: adminSendResult.status,
      errorMessage: adminSendResult.errorMessage,
      normalizedPhone: normalizedAdminPhone
    }
  }
}

export const sendStudioNotificationSafely = async (
  input: SendStudioNotificationInput
): Promise<SendStudioNotificationResult | null> => {
  try {
    return await sendStudioNotification(input)
  } catch (error) {
    console.error("[studio sms notification failed]", error)
    return null
  }
}
