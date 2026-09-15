import type {
  AlimtalkButton,
  AlimtalkTemplatePayload,
  ParentNotificationContext
} from "@/features/notifications/alimtalk/types"

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
    case "trial_report_published":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_REPORT_PUBLISHED?.trim() ?? ""
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
    case "trial_report_published": {
      // 링크가 없으면 보내지 않는다. 확인하라고 해 놓고 갈 곳이 없으면
      // 부모는 앱을 뒤지게 되고, 그게 알림이 하는 일이 되면 안 된다.
      // (본문에는 쓰지 않지만, 버튼을 만들 수 없다는 뜻이라 여기서 막는다.)
      if (!resolveTemplateValue(context.reportUrl ?? null)) {
        return null
      }

      // 본문에 URL 을 적지 않는다. 링크는 버튼이 맡는다 —
      // 본문 링크는 기기에 따라 잘리거나 눌리지 않아서, 부모가 "확인하기" 를
      // 보고도 못 가는 일이 생긴다.
      return [
        `[첫수업] 체험 리포트가 도착했어요`,
        ``,
        `${studentName}님의 체험수업 리포트가`,
        `${academyName}에서 발행되었습니다.`,
        ``,
        `수업에서 관찰된 모습과`,
        `선생님의 총평을 확인해 보세요.`
      ].join("\n")
    }
  }
}

/**
 * template 에 붙는 버튼.
 *
 * 리포트 알림에만 있다. 나머지 넷은 버튼 없는 template 으로 승인돼 있어서
 * 여기서 붙이면 template 과 어긋난다.
 *
 * ⚠️ 승인받을 알림톡 template 에도 같은 이름·같은 링크의 버튼이 정의돼 있어야
 *    한다. payload 의 버튼과 template 의 버튼이 다르면 발송이 거절된다.
 */
const resolveTemplateButtons = (
  context: ParentNotificationContext
): AlimtalkButton[] | undefined => {
  if (context.eventType !== "trial_report_published") {
    return undefined
  }

  const reportUrl = resolveTemplateValue(context.reportUrl ?? null)
  if (!reportUrl) {
    return undefined
  }

  return [
    {
      type: "WL",
      name: "체험 리포트 확인하기",
      // 반응형 한 화면이라 모바일과 PC 가 같은 주소다.
      linkMobile: reportUrl,
      linkPc: reportUrl
    }
  ]
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

  const buttons = resolveTemplateButtons(context)

  return {
    template: {
      templateCode,
      content,
      ...(buttons ? { buttons } : {})
    },
    errorMessage: null
  }
}
