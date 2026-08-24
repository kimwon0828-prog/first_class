import type { ParentNotificationContext, AlimtalkTemplatePayload } from "@/features/notifications/alimtalk/types"

type AlimtalkTemplateRenderResult =
  | {
      template: AlimtalkTemplatePayload
      errorMessage: null
    }
  | {
      template: null
      errorMessage: "alimtalk_template_missing" | "alimtalk_template_data_missing"
    }

const resolveTemplateCode = (eventType: ParentNotificationContext["eventType"]) => {
  switch (eventType) {
    case "trial_schedule_confirmed":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_SCHEDULE_CONFIRMED?.trim() ?? ""
    case "trial_rejected":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_REJECTED?.trim() ?? ""
    case "trial_completed":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_COMPLETED?.trim() ?? ""
    case "trial_reminder":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_REMINDER?.trim() ?? ""
  }
}

const resolveTemplateValue = (value: string | null) => {
  const normalized = value?.replace(/\s+/g, " ").trim()
  return normalized || null
}

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
  const rawDayPeriod = parts.find((part) => part.type === "dayPeriod")?.value?.replace(/\s+/g, "") ?? ""
  const dayPeriod = rawDayPeriod === "AM" ? "오전" : rawDayPeriod === "PM" ? "오후" : rawDayPeriod

  if (!month || !day || !hour || !minute || !dayPeriod) {
    return null
  }

  return minute === "00" ? `${month}/${day} ${dayPeriod} ${hour}시` : `${month}/${day} ${dayPeriod} ${hour}:${minute}`
}

export const renderAlimtalkContent = (context: ParentNotificationContext): string | null => {
  const parentName = resolveTemplateValue(context.parentName)
  const studentName = resolveTemplateValue(context.studentName)
  const academyName = resolveTemplateValue(context.academyName)
  const classTitle = resolveTemplateValue(context.classTitle)

  if (!parentName || !studentName || !academyName || !classTitle) {
    return null
  }

  switch (context.eventType) {
    case "trial_schedule_confirmed": {
      const scheduledAt = formatDateTime(context.confirmedSlotAt) ?? formatDateTime(context.requestedSlotAt)
      if (!scheduledAt) {
        return null
      }

      return [
        "[첫수업] 체험수업 일정이 확정되었습니다.",
        "",
        `안녕하세요, ${parentName}님.`,
        `${studentName} 학생의 체험수업 일정이 확정되었습니다.`,
        "",
        `학원: ${academyName}`,
        `수업: ${classTitle}`,
        `일정: ${scheduledAt}`,
        "",
        "자세한 내용은 첫수업 내 신청 내역에서 확인해 주세요."
      ].join("\n")
    }
    case "trial_rejected":
      return [
        "[첫수업] 체험수업 신청이 취소되었습니다.",
        "",
        `안녕하세요, ${parentName}님.`,
        `${studentName} 학생의 체험수업 신청이 취소되었습니다.`,
        "",
        `학원: ${academyName}`,
        `수업: ${classTitle}`,
        "",
        "자세한 내용은 첫수업 내 신청 내역에서 확인해 주세요."
      ].join("\n")
    case "trial_completed":
      return [
        "[첫수업] 신청하신 체험수업 완료 안내입니다.",
        "",
        `안녕하세요, ${parentName}님.`,
        `첫수업에서 신청하신 ${studentName} 학생의 체험수업이 완료되어 안내드립니다.`,
        "",
        `학원: ${academyName}`,
        `수업: ${classTitle}`,
        "",
        "상담 및 등록 안내는 학원 안내에 따라 진행됩니다"
      ].join("\n")
    case "trial_reminder": {
      const scheduledAt = formatDateTime(context.confirmedSlotAt) ?? formatDateTime(context.requestedSlotAt)
      if (!scheduledAt) {
        return null
      }

      return [
        "[첫수업] 신청하신 체험수업 하루 전 안내입니다.",
        "",
        `안녕하세요, ${parentName}님.`,
        `첫수업에서 신청하신 ${studentName} 학생의 체험수업이 내일 예정되어 있어 안내드립니다.`,
        "",
        `학원: ${academyName}`,
        `수업: ${classTitle}`,
        `일정: ${scheduledAt}`,
        "",
        "변경이 필요하신 경우 학원으로 문의해 주세요."
      ].join("\n")
    }
  }
}

export const renderAlimtalkTemplate = (
  context: ParentNotificationContext
): AlimtalkTemplateRenderResult => {
  const templateCode = resolveTemplateCode(context.eventType)
  if (!templateCode) {
    return {
      template: null,
      errorMessage: "alimtalk_template_missing"
    }
  }

  const content = renderAlimtalkContent(context)
  if (!content) {
    return {
      template: null,
      errorMessage: "alimtalk_template_data_missing"
    }
  }

  return {
    template: {
      templateCode,
      content
    },
    errorMessage: null
  }
}
