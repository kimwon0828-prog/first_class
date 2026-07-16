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
const joinLines = (parts: Array<string | null>) => parts.filter(Boolean).join("\n")
const joinSections = (parts: Array<string | null>) => parts.filter(Boolean).join("\n\n")

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
  classTitle?.trim() ? classTitle.trim() : "체험수업"

const resolveAcademyText = (academyName: string | null) =>
  academyName?.trim() ? academyName.trim() : "학원 정보는 스튜디오에서 확인해 주세요."

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

const resolveTeacherText = (assignedTeacherName: string | null) =>
  assignedTeacherName?.trim() ? assignedTeacherName.trim() : "담당 선생님 미지정"

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

const renderTeacherMultilineMessage = (
  leadingText: string,
  context: SmsTemplateRenderInput["context"],
  classText: string,
  closingText: string
) =>
  joinSections([
    `[첫수업] ${leadingText}`,
    joinLines([
      `수업: ${classText}`,
      `학생: ${resolveStudentText(context)}`,
      `일정: ${resolveScheduleText(context)}`
    ]),
    closingText
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
          messagePreview: joinMessage([
            "[첫수업]",
            `${classText} 등록이 완료되었습니다.`,
            "수업 준비 안내는 운영진이 별도로 전달드립니다."
          ])
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
          messagePreview: joinSections([
            "[첫수업] 새 체험수업 신청 알림",
            "새 체험수업 신청이 접수되었습니다.",
            joinLines([
              `학생: ${resolveStudentText(context)}`,
              `수업: ${classText}`,
              `담당 선생님: ${resolveTeacherText(context.assignedTeacherName)}`
            ]),
            "스튜디오에서 신청 정보를 확인해 주세요."
          ])
        }
      case "admin_trial_canceled":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업 신청 취소 알림",
            "체험수업 신청이 취소되었습니다.",
            joinLines([
              `학생: ${resolveStudentText(context)}`,
              `수업: ${classText}`,
              `담당 선생님: ${resolveTeacherText(context.assignedTeacherName)}`
            ]),
            "스튜디오에서 신청 정보를 확인해 주세요."
          ])
        }
      case "admin_trial_schedule_confirmed":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 체험수업 일정 확정 알림",
            "체험수업 일정이 확정되었습니다.",
            joinLines([
              `학생: ${resolveStudentText(context)}`,
              `수업: ${classText}`,
              `담당 선생님: ${resolveTeacherText(context.assignedTeacherName)}`,
              `일정: ${scheduleText}`
            ]),
            "스튜디오에서 신청 정보를 확인해 주세요."
          ])
        }
      case "admin_trial_reminder":
        return {
          templateKey: eventType,
          messagePreview: joinSections([
            "[첫수업] 내일 체험수업 일정 안내",
            "내일 체험수업이 예정되어 있습니다.",
            joinLines([
              `학생: ${resolveStudentText(context)}`,
              `수업: ${classText}`,
              `담당 선생님: ${resolveTeacherText(context.assignedTeacherName)}`,
              `일정: ${scheduleText}`
            ]),
            "스튜디오에서 신청 정보를 확인해 주세요."
          ])
        }
      default:
        throw new Error("unsupported_admin_sms_event")
    }
  }

  switch (eventType) {
    case "teacher_trial_requested":
      return {
        templateKey: eventType,
        messagePreview: joinSections([
          "[첫수업] 새로운 체험수업 신청이 들어왔습니다.",
          joinLines([
            `수업: ${classText}`,
            `학생: ${resolveStudentText(context)}`,
            `희망일정: ${scheduleText}`
          ]),
          "첫수업 운영보드에서 신청 내용을 확인해주세요."
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
        messagePreview: renderTeacherMultilineMessage(
          "체험수업 일정이 확정되었습니다.",
          context,
          classText,
          "수업 준비를 부탁드립니다."
        )
      }
    case "teacher_trial_schedule_updated":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMessage("체험수업 일정이 변경되었습니다.", context, classText)
      }
    case "teacher_trial_canceled":
      return {
        templateKey: eventType,
        messagePreview: renderTeacherMultilineMessage(
          "체험수업 신청이 취소되었습니다.",
          context,
          classText,
          "운영보드에서 취소 내역을 확인해주세요."
        )
      }
    case "teacher_trial_reminder":
      return {
        templateKey: eventType,
        messagePreview: joinSections([
          "[첫수업] 내일 체험수업 일정 안내",
          "내일 담당 체험수업이 예정되어 있습니다.",
          joinLines([
            `학생: ${resolveStudentText(context)}`,
            `수업: ${classText}`,
            `일정: ${scheduleText}`
          ]),
          "스튜디오에서 신청 정보를 확인해 주세요."
        ])
      }
    default:
      throw new Error("unsupported_teacher_sms_event")
  }
}
