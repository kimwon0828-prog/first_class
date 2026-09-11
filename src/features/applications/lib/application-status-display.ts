// 학부모가 보는 신청 상태.
//
// Application lifecycle(new · reviewing · confirmed · completed · canceled)만 쓴다.
// 등록 여부(registration_status)는 학원의 운영 판단이라 여기에 들어오지 않는다 —
// 학부모 화면은 "체험이 어디까지 왔는가" 만 말한다.

export type ApplicationStatusDisplay = {
  label: string
  tone: "active" | "muted"
  group: "upcoming" | "pending" | "past"
}

type ResolveApplicationStatusDisplayInput = {
  status: string
  scheduledAt: string | null
  now?: Date
}

const isPastSchedule = (scheduledAt: string | null, now: Date) => {
  if (!scheduledAt) {
    return false
  }

  const date = new Date(scheduledAt)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.getTime() < now.getTime()
}

export const resolveApplicationStatusDisplay = ({
  status,
  scheduledAt,
  now = new Date()
}: ResolveApplicationStatusDisplayInput): ApplicationStatusDisplay => {
  if (status === "new" || status === "reviewing") {
    return {
      label: "학원 확인 중",
      tone: "muted",
      group: "pending"
    }
  }

  if (status === "confirmed") {
    if (!scheduledAt) {
      return {
        label: "확정됨",
        tone: "active",
        group: "pending"
      }
    }

    return {
      label: "확정됨",
      tone: "active",
      group: isPastSchedule(scheduledAt, now) ? "past" : "upcoming"
    }
  }

  if (status === "completed") {
    return {
      // "완료" 는 무엇의 완료인지 모호했다. 등록 완료와 구분해 체험 기준으로 적는다.
      label: "체험 완료",
      tone: "muted",
      group: "past"
    }
  }

  if (status === "canceled") {
    return {
      label: "취소됨",
      tone: "muted",
      group: "past"
    }
  }

  console.warn("[my-applications] unexpected application status", {
    status
  })

  return {
    label: "기타",
    tone: "muted",
    group: "past"
  }
}
