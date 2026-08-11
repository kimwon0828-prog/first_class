import type { ApplicationRegistrationStatus } from "@/shared/lib/db/adapter"

export type ApplicationStatusDisplay = {
  label: string
  tone: "active" | "muted"
  group: "upcoming" | "pending" | "past"
}

type ResolveApplicationStatusDisplayInput = {
  status: string
  scheduledAt: string | null
  registrationStatus: ApplicationRegistrationStatus | null
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
  registrationStatus,
  now = new Date()
}: ResolveApplicationStatusDisplayInput): ApplicationStatusDisplay => {
  if (registrationStatus === "enrolled") {
    return {
      label: "완료",
      tone: "muted",
      group: "past"
    }
  }

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
      label: "완료",
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
