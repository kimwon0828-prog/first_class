import type { SmsTemplateRenderInput, SmsTemplateRenderResult } from "@/features/notifications/sms/types"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)
}

const joinMessage = (parts: string[]) => parts.filter(Boolean).join(" ")
const joinDetail = (parts: string[]) => parts.filter(Boolean).join(" / ")

const resolveScheduleText = (input: SmsTemplateRenderInput["context"]) => {
  return (
    formatDateTime(input.scheduledAt) ??
    formatDateTime(input.requestedAt) ??
    input.selectedScheduleLabel?.trim() ??
    "일정은 운영진이 별도로 안내드릴 예정입니다."
  )
}

const resolveOptionalScheduleDetail = (input: SmsTemplateRenderInput["context"]) => {
  const confirmedSchedule = formatDateTime(input.scheduledAt)
  if (confirmedSchedule) {
    return `일정: ${confirmedSchedule}`
  }

  const requestedSchedule = formatDateTime(input.requestedAt)
  if (requestedSchedule) {
    return `신청 일정: ${requestedSchedule}`
  }

  const selectedScheduleLabel = input.selectedScheduleLabel?.trim()
  if (selectedScheduleLabel) {
    return `신청 일정: ${selectedScheduleLabel}`
  }

  return null
}

const resolveClassText = (classTitle: string | null) =>
  classTitle?.trim() ? `${classTitle.trim()} 체험수업` : "체험수업"

const resolveStudentText = (input: SmsTemplateRenderInput["context"]) => {
  const childName = input.childName?.trim()
  if (childName) {
    return childName
  }

  const parentDisplayName = input.parentDisplayName?.trim()
  if (parentDisplayName) {
    return parentDisplayName
  }

  return "신청자"
}

const renderTeacherMessage = (
  leadingText: string,
  context: SmsTemplateRenderInput["context"],
  classText: string
) =>
  joinMessage([
    "[첫수업]",
    leadingText,
    joinDetail([
      `수업: ${classText}`,
      `학생: ${resolveStudentText(context)}`,
      resolveOptionalScheduleDetail(context) ?? ""
    ])
  ])

export const renderSmsTemplate = ({
  recipientType,
  eventType,
  context
}: SmsTemplateRenderInput): SmsTemplateRenderResult => {
  const classText = resolveClassText(context.classTitle)
  const scheduleText = resolveScheduleText(context)

  if (recipientType === "parent") {
    switch (eventType) {
      case "trial_contact_started":
        return {
          templateKey: eventType,
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 신청이 확인되었습니다.`,
            "운영진이 상담을 이어서 안내드릴 예정입니다."
          ])
        }
      case "trial_schedule_confirmed":
        return {
          templateKey: eventType,
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 일정이 확정되었습니다.`,
            `확정 일정: ${scheduleText}`,
            "변경이 필요하면 운영진에게 연락해 주세요."
          ])
        }
      case "trial_completed":
        return {
          templateKey: eventType,
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 진행이 완료되었습니다.`,
            "등록 상담이 필요하면 운영진이 후속 안내를 드릴 예정입니다."
          ])
        }
      case "trial_enrolled":
        return {
          templateKey: eventType,
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 등록이 완료되었습니다.`,
            "수업 준비 안내는 운영진이 별도로 전달드립니다."
          ])
        }
      case "trial_reminder":
        return {
          templateKey: eventType,
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 리마인드 안내입니다.`,
            `예정 일정: ${scheduleText}`
          ])
        }
      default:
        throw new Error("unsupported_parent_sms_event")
    }
  }

  switch (eventType) {
    case "teacher_trial_requested":
      return {
        templateKey: eventType,
        messagePreview: joinMessage([
          "[첫수업]",
          "새로운 체험수업 신청이 접수되었습니다.",
          joinDetail([`수업: ${classText}`, `학생: ${resolveStudentText(context)}`])
        ])
      }
    case "teacher_trial_assigned":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("담당 체험수업이 배정되었습니다.", context, classText)
      }
    case "teacher_trial_schedule_confirmed":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("체험수업 일정이 확정되었습니다.", context, classText)
      }
    case "teacher_trial_schedule_updated":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("체험수업 일정이 변경되었습니다.", context, classText)
      }
    case "teacher_trial_canceled":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("체험수업 신청이 취소되었습니다.", context, classText)
      }
    default:
      throw new Error("unsupported_teacher_sms_event")
  }
}
