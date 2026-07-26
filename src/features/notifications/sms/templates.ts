import type { SmsTemplateRenderInput, SmsTemplateRenderResult } from "@/features/notifications/sms/types"
import { sanitizeSmsSingleLine } from "@/features/notifications/sms/byte-utils"

const joinLines = (parts: Array<string | null>) => parts.filter(Boolean).join("\n")
const joinSections = (parts: Array<string | null>) => parts.filter(Boolean).join("\n\n")

const DEFAULT_SCHEDULE_TEXT = "일정 확인 필요"
const DEFAULT_CLASS_TEXT = "체험수업"
const DEFAULT_STUDENT_TEXT = "신청자"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
  const parts = formatter.formatToParts(date)
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  const hour = parts.find((part) => part.type === "hour")?.value
  const minute = parts.find((part) => part.type === "minute")?.value
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value?.replace(/\s+/g, "") ?? ""

  if (!month || !day || !hour || !minute || !dayPeriod) {
    return null
  }

  return minute === "00" ? `${month}/${day} ${dayPeriod} ${hour}시` : `${month}/${day} ${dayPeriod} ${hour}:${minute}`
}

const resolveScheduleText = (input: SmsTemplateRenderInput["context"]) =>
  formatDateTime(input.scheduledAt) ?? formatDateTime(input.requestedAt) ?? DEFAULT_SCHEDULE_TEXT

const resolveClassText = (classTitle: string | null) => {
  const resolved = sanitizeSmsSingleLine(classTitle, 10)
  return resolved || DEFAULT_CLASS_TEXT
}

const resolveAcademyText = (academyName: string | null) =>
  academyName?.trim() ? academyName.trim() : "학원 정보는 스튜디오에서 확인해 주세요."

const resolveStudentText = (input: SmsTemplateRenderInput["context"]) => {
  const childName = sanitizeSmsSingleLine(input.childName, 7)
  if (childName) {
    return childName
  }

  const parentDisplayName = sanitizeSmsSingleLine(input.parentDisplayName, 7)
  if (parentDisplayName) {
    return parentDisplayName
  }

  return DEFAULT_STUDENT_TEXT
}

const renderCompactMessage = (
  heading: string,
  context: SmsTemplateRenderInput["context"],
  classText: string
) =>
  joinLines([
    `[첫수업] ${heading}`,
    classText,
    `${resolveStudentText(context)} / ${resolveScheduleText(context)}`
  ])

const renderTeacherMessage = (
  leadingText: string,
  context: SmsTemplateRenderInput["context"],
  classText: string
) =>
  renderCompactMessage(leadingText, context, classText)

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
          messagePreview: [
            "[첫수업]",
            `${classText} 신청이 확인되었습니다.`,
            "운영진이 상담을 이어서 안내드릴 예정입니다."
          ].join(" ")
        }
      case "trial_rejected":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업 신청이 진행되지 않게 되었습니다.",
            joinLines([`수업: ${classText}`, `학생: ${resolveStudentText(context)}`]),
            "자세한 내용은 학원으로 문의해주세요."
          ])
        }
      case "trial_schedule_confirmed":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업 일정이 확정되었습니다.",
            joinLines([
              `수업: ${classText}`,
              `학생: ${resolveStudentText(context)}`,
              `일정: ${scheduleText}`
            ]),
            "좋은 첫수업이 될 수 있도록 학원에서 준비하겠습니다."
          ])
        }
      case "trial_completed":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업이 완료되었습니다.",
            joinLines([`수업: ${classText}`, `학생: ${resolveStudentText(context)}`]),
            "수업 후 등록 상담은 학원에서 안내드릴 예정입니다."
          ])
        }
      case "trial_enrolled":
        return {
          templateKey: eventType,
          messagePreview: [
            "[첫수업]",
            `${classText} 등록이 완료되었습니다.`,
            "수업 준비 안내는 운영진이 별도로 전달드립니다."
          ].join(" ")
        }
      case "trial_reminder":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업 하루 전 안내",
            joinLines([`${resolveStudentText(context)} 학생의 체험수업이 내일 예정되어 있습니다.`]),
            joinLines([
              `학원: ${resolveAcademyText(context.academyName)}`,
              `수업: ${classText}`,
              `일정: ${scheduleText}`
            ]),
            "변경이 필요하신 경우 학원으로 문의해 주세요."
          ])
        }
      default:
        throw new Error("unsupported_parent_sms_event")
    }
  }

  if (recipientType === "admin") {
    switch (eventType) {
      case "admin_trial_requested":
        return {
          templateKey: eventType,
          messagePreview: renderCompactMessage("신규 신청", context, classText)
        }
      case "admin_trial_canceled":
        return {
          templateKey: eventType,
          messagePreview: renderCompactMessage("신청 취소", context, classText)
        }
      case "admin_trial_schedule_confirmed":
        return {
          templateKey: eventType,
          messagePreview: renderCompactMessage("일정 확정", context, classText)
        }
      case "admin_trial_reminder":
        return {
          templateKey: eventType,
          messagePreview: renderCompactMessage("내일 수업", context, classText)
        }
      default:
        throw new Error("unsupported_admin_sms_event")
    }
  }

  switch (eventType) {
    case "teacher_trial_requested":
      return {
        templateKey: eventType,
        messagePreview: renderCompactMessage("신규 신청", context, classText)
      }
    case "teacher_trial_assigned":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("수업 배정", context, classText)
      }
    case "teacher_trial_schedule_confirmed":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("일정 확정", context, classText)
      }
    case "teacher_trial_schedule_updated":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("일정 변경", context, classText)
      }
    case "teacher_trial_canceled":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("신청 취소", context, classText)
      }
    case "teacher_trial_reminder":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("내일 수업", context, classText)
      }
    default:
      throw new Error("unsupported_teacher_sms_event")
  }
}
