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

const resolveScheduleText = (input: SmsTemplateRenderInput["context"]) => {
  return (
    formatDateTime(input.scheduledAt) ??
    formatDateTime(input.requestedAt) ??
    input.selectedScheduleLabel?.trim() ??
    "일정은 운영진이 별도로 안내드릴 예정입니다."
  )
}

const resolveClassText = (classTitle: string | null) =>
  classTitle?.trim() ? `${classTitle.trim()} 체험수업` : "체험수업"

export const renderSmsTemplate = ({
  recipientType,
  eventType,
  context
}: SmsTemplateRenderInput): SmsTemplateRenderResult => {
  const classText = resolveClassText(context.classTitle)
  const scheduleText = resolveScheduleText(context)
  const teacherText = context.assignedTeacherName?.trim() ? context.assignedTeacherName.trim() : "담당 선생님"

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
    case "teacher_trial_assigned":
      return {
        templateKey: eventType,
        messagePreview: joinMessage([
          "[첫수업]",
          `${teacherText}님에게 ${classText}이 배정되었습니다.`,
          `진행 일정: ${scheduleText}`
        ])
      }
    case "teacher_trial_schedule_confirmed":
      return {
        templateKey: eventType,
        messagePreview: joinMessage([
          "[첫수업]",
          `${teacherText} 담당 ${classText} 일정이 확정되었습니다.`,
          `확정 일정: ${scheduleText}`
        ])
      }
    case "teacher_trial_schedule_updated":
      return {
        templateKey: eventType,
        messagePreview: joinMessage([
          "[첫수업]",
          `${teacherText} 담당 ${classText} 일정이 변경되었습니다.`,
          `변경 일정: ${scheduleText}`
        ])
      }
    case "teacher_trial_canceled":
      return {
        templateKey: eventType,
        messagePreview: joinMessage([
          "[첫수업]",
          `${teacherText} 담당 ${classText} 일정이 취소되었습니다.`,
          "변경 사항은 운영 화면에서 다시 확인해 주세요."
        ])
      }
    default:
      throw new Error("unsupported_teacher_sms_event")
  }
}
