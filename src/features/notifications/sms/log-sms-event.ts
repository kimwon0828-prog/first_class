import "server-only"

import { sendSms } from "@/features/notifications/sms/sender"
import { renderSmsTemplate } from "@/features/notifications/sms/templates"
import type { SmsEventType, SmsRecipientType } from "@/features/notifications/sms/types"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

type SmsApplicationContext = Omit<
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

type LogSmsEventInput = {
  organizationId: string
  application: SmsApplicationContext
  createdBy?: string | null
  recipientType: SmsRecipientType
  eventType: SmsEventType
  targetTeacherId?: string | null
}

type ParentRecipient = {
  recipientName: string | null
  recipientPhone: string | null
  errorMessage: string | null
}

type TeacherRecipient = {
  recipientName: string | null
  recipientPhone: string | null
  teacherId: string | null
  smsEnabled: boolean
  errorMessage: string | null
}

type TeacherProfileRow = {
  id: string
  role: string | null
  name: string | null
}

const sanitizePreview = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim()
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}

const resolveTeacherDisplayName = (
  teacherDisplayName: string | null | undefined,
  profileName: string | null | undefined
) => teacherDisplayName?.trim() || profileName?.trim() || "선생님"

const resolveFallbackErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.trim() : ""
  return message || "failed_to_log_sms_event"
}

const resolveFallbackMessagePreview = (input: LogSmsEventInput) => {
  try {
    const template = renderSmsTemplate({
      recipientType: input.recipientType,
      eventType: input.eventType,
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

    return sanitizePreview(template.messagePreview)
  } catch {
    return null
  }
}

const insertFallbackSmsLog = async (input: LogSmsEventInput, error: unknown) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const recipientName =
    input.recipientType === "teacher"
      ? input.application.assignedTeacherName?.trim() || null
      : input.application.parentName?.trim() || null
  const teacherId =
    input.recipientType === "teacher"
      ? input.targetTeacherId ?? input.application.assignedTeacherId ?? null
      : null

  const { error: insertError } = await serviceRoleClient.from("sms_logs").insert({
    organization_id: input.organizationId,
    trial_application_id: input.application.id,
    class_id: input.application.classId ?? null,
    teacher_id: teacherId,
    recipient_type: input.recipientType,
    recipient_name: recipientName,
    recipient_phone_masked: null,
    event_type: input.eventType,
    template_key: input.eventType,
    message_preview: resolveFallbackMessagePreview(input),
    status: "failed",
    provider: null,
    provider_message_id: null,
    error_message: resolveFallbackErrorMessage(error),
    created_by: input.createdBy ?? null,
    sent_at: null
  })

  if (insertError) {
    throw new Error("failed_to_insert_sms_log_fallback")
  }
}

const resolveParentRecipient = async (
  parentId: string | null,
  parentName: string | null,
  parentPhone: string | null
): Promise<ParentRecipient> => {
  if (!parentId) {
    return {
      recipientName: parentName?.trim() || null,
      recipientPhone: parentPhone?.trim() || null,
      errorMessage: "parent_profile_missing"
    }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("profiles")
    .select("id, role")
    .eq("id", parentId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_parent_sms_recipient")
  }

  if (!data || data.role !== "parent") {
    return {
      recipientName: parentName?.trim() || null,
      recipientPhone: parentPhone?.trim() || null,
      errorMessage: "excluded_non_parent_recipient"
    }
  }

  return {
    recipientName: parentName?.trim() || null,
    recipientPhone: parentPhone?.trim() || null,
    errorMessage: null
  }
}

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

  let profileData: TeacherProfileRow | null = null

  if (data.profile_id) {
    const { data: fetchedProfileData, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("id, role, name")
      .eq("id", data.profile_id)
      .maybeSingle()

    if (profileError) {
      throw new Error("failed_to_fetch_teacher_sms_profile")
    }

    profileData = (fetchedProfileData as TeacherProfileRow | null) ?? null

    if (!profileData || profileData.role !== "teacher") {
      return {
        recipientName: resolveTeacherDisplayName(data.display_name, profileData?.name),
        recipientPhone: data.phone?.trim() || null,
        teacherId: data.id,
        smsEnabled: Boolean(data.sms_enabled),
        errorMessage: "excluded_non_teacher_recipient"
      }
    }
  }

  if (!data.is_active) {
    return {
      recipientName: resolveTeacherDisplayName(data.display_name, profileData?.name),
      recipientPhone: data.phone?.trim() || null,
      teacherId: data.id,
      smsEnabled: Boolean(data.sms_enabled),
      errorMessage: "teacher_inactive"
    }
  }

  return {
    recipientName: resolveTeacherDisplayName(data.display_name, profileData?.name),
    recipientPhone: data.phone?.trim() || null,
    teacherId: data.id,
    smsEnabled: Boolean(data.sms_enabled),
    errorMessage: null
  }
}

export const logSmsEvent = async ({
  organizationId,
  application,
  createdBy,
  recipientType,
  eventType,
  targetTeacherId
}: LogSmsEventInput) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const template = renderSmsTemplate({
    recipientType,
    eventType,
    context: {
      academyName: application.academyName?.trim() ?? null,
      classTitle: application.classTitle ?? null,
      childName: application.childName?.trim() ?? null,
      parentDisplayName: application.parentName?.trim() ?? null,
      scheduledAt: application.confirmedSlotAt ?? null,
      requestedAt: application.requestedSlotAt ?? null,
      selectedScheduleLabel: application.selectedScheduleLabel ?? null,
      assignedTeacherName: application.assignedTeacherName ?? null
    }
  })

  if (recipientType === "parent") {
    const recipient = await resolveParentRecipient(
      application.parentId ?? null,
      application.parentName ?? null,
      application.parentPhone ?? null
    )

    const sendResult =
      recipient.errorMessage === null
        ? await sendSms({
            recipientType,
            phone: recipient.recipientPhone,
            messagePreview: template.messagePreview
          })
        : {
            status: "skipped" as const,
            provider: "dry_run" as const,
            providerMessageId: null,
            errorMessage: recipient.errorMessage,
            recipientPhoneMasked: null,
            sentAt: null
          }

    const { error } = await serviceRoleClient.from("sms_logs").insert({
      organization_id: organizationId,
      trial_application_id: application.id,
      class_id: application.classId ?? null,
      teacher_id: null,
      recipient_type: recipientType,
      recipient_name: recipient.recipientName,
      recipient_phone_masked: sendResult.recipientPhoneMasked,
      event_type: eventType,
      template_key: template.templateKey,
      message_preview: sanitizePreview(template.messagePreview),
      status: sendResult.status,
      provider: sendResult.provider,
      provider_message_id: sendResult.providerMessageId,
      error_message: sendResult.errorMessage,
      created_by: createdBy ?? null,
      sent_at: sendResult.sentAt
    })

    if (error) {
      throw new Error("failed_to_insert_parent_sms_log")
    }

    return
  }

  const recipient = await resolveTeacherRecipient(
    organizationId,
    targetTeacherId ?? application.assignedTeacherId ?? null
  )

  const sendResult =
    recipient.errorMessage === null
      ? await sendSms({
          recipientType,
          phone: recipient.recipientPhone,
          smsEnabled: recipient.smsEnabled,
          messagePreview: template.messagePreview
        })
      : {
          status: "skipped" as const,
          provider: "dry_run" as const,
          providerMessageId: null,
          errorMessage: recipient.errorMessage,
          recipientPhoneMasked: null,
          sentAt: null
        }

  const { error } = await serviceRoleClient.from("sms_logs").insert({
    organization_id: organizationId,
    trial_application_id: application.id,
    class_id: application.classId ?? null,
    teacher_id: recipient.teacherId,
    recipient_type: recipientType,
    recipient_name: recipient.recipientName,
    recipient_phone_masked: sendResult.recipientPhoneMasked,
    event_type: eventType,
    template_key: template.templateKey,
    message_preview: sanitizePreview(template.messagePreview),
    status: sendResult.status,
    provider: sendResult.provider,
    provider_message_id: sendResult.providerMessageId,
    error_message: sendResult.errorMessage,
    created_by: createdBy ?? null,
    sent_at: sendResult.sentAt
  })

  if (error) {
    throw new Error("failed_to_insert_teacher_sms_log")
  }
}

export const logSmsEventSafely = async (input: LogSmsEventInput) => {
  try {
    await logSmsEvent(input)
  } catch (error) {
    console.error("[sms dry-run log failed]", error)

    try {
      await insertFallbackSmsLog(input, error)
    } catch (fallbackError) {
      console.error("[sms fallback log failed]", fallbackError)
    }
  }
}
