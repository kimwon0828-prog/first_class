import type {
  ApplicationRegistrationStatus,
  StudioConsultationPipelineApplicationItem
} from "@/shared/lib/db/adapter"

export type ConsultationPipelineGroup =
  | "TODAY_CONTACT"
  | "NEEDS_CONSULTATION"
  | "NO_NEXT_CONTACT"
  | "UPCOMING_CONTACT"
  | "CLOSED"

const GROUP_RANK: Record<ConsultationPipelineGroup, number> = {
  TODAY_CONTACT: 1,
  NEEDS_CONSULTATION: 2,
  NO_NEXT_CONTACT: 3,
  UPCOMING_CONTACT: 4,
  CLOSED: 5
}

const ACTIVE_REGISTRATION_STATUSES: ApplicationRegistrationStatus[] = ["undecided", "pending"]
const CLOSED_REGISTRATION_STATUSES: ApplicationRegistrationStatus[] = ["enrolled", "not_enrolled"]

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

const compareNullableAsc = (left: string | null, right: string | null, nullsFirst: boolean) => {
  const leftValue = toTimestamp(left)
  const rightValue = toTimestamp(right)

  if (leftValue == null && rightValue == null) {
    return 0
  }

  if (leftValue == null) {
    return nullsFirst ? -1 : 1
  }

  if (rightValue == null) {
    return nullsFirst ? 1 : -1
  }

  return leftValue - rightValue
}

const compareNullableDesc = (left: string | null, right: string | null, nullsLast: boolean) => {
  return compareNullableAsc(left, right, !nullsLast) * -1
}

export const isConsultationPipelineActiveRegistrationStatus = (
  status: ApplicationRegistrationStatus | null | undefined
): status is "undecided" | "pending" => {
  return ACTIVE_REGISTRATION_STATUSES.includes(status as ApplicationRegistrationStatus)
}

export const isConsultationPipelineClosedRegistrationStatus = (
  status: ApplicationRegistrationStatus | null | undefined
): status is "enrolled" | "not_enrolled" => {
  return CLOSED_REGISTRATION_STATUSES.includes(status as ApplicationRegistrationStatus)
}

export const getConsultationPipelineGroup = (
  item: Pick<
    StudioConsultationPipelineApplicationItem,
    "registrationStatus" | "nextContactAt" | "hasAnyConsultationHistory"
  >,
  now: Date = new Date()
): ConsultationPipelineGroup => {
  if (isConsultationPipelineClosedRegistrationStatus(item.registrationStatus)) {
    return "CLOSED"
  }

  const nextContactAt = toTimestamp(item.nextContactAt)
  const nowTimestamp = now.getTime()

  if (nextContactAt != null && nextContactAt <= nowTimestamp) {
    return "TODAY_CONTACT"
  }

  if (nextContactAt != null && nextContactAt > nowTimestamp) {
    return "UPCOMING_CONTACT"
  }

  if (!item.hasAnyConsultationHistory) {
    return "NEEDS_CONSULTATION"
  }

  return "NO_NEXT_CONTACT"
}

export const compareConsultationPipelineItems = (
  left: StudioConsultationPipelineApplicationItem,
  right: StudioConsultationPipelineApplicationItem
) => {
  const groupDelta = GROUP_RANK[left.pipelineGroup] - GROUP_RANK[right.pipelineGroup]
  if (groupDelta !== 0) {
    return groupDelta
  }

  switch (left.pipelineGroup) {
    case "TODAY_CONTACT":
    case "UPCOMING_CONTACT": {
      const nextContactDelta = compareNullableAsc(left.nextContactAt, right.nextContactAt, false)
      if (nextContactDelta !== 0) {
        return nextContactDelta
      }
      break
    }
    case "NEEDS_CONSULTATION": {
      const completedDelta = compareNullableAsc(left.completedAt, right.completedAt, false)
      if (completedDelta !== 0) {
        return completedDelta
      }
      break
    }
    case "NO_NEXT_CONTACT": {
      const lastActivityDelta = compareNullableAsc(left.lastActivityAt, right.lastActivityAt, true)
      if (lastActivityDelta !== 0) {
        return lastActivityDelta
      }
      break
    }
    case "CLOSED": {
      const leftClosedAt = left.enrolledAt ?? left.lostAt
      const rightClosedAt = right.enrolledAt ?? right.lostAt
      const closedDelta = compareNullableDesc(leftClosedAt, rightClosedAt, true)
      if (closedDelta !== 0) {
        return closedDelta
      }
      break
    }
  }

  const completedFallbackDelta = compareNullableAsc(left.completedAt, right.completedAt, false)
  if (completedFallbackDelta !== 0) {
    return completedFallbackDelta
  }

  const nowAwareActivityDelta =
    left.pipelineGroup === "TODAY_CONTACT" || left.pipelineGroup === "UPCOMING_CONTACT"
      ? compareNullableAsc(left.lastActivityAt, right.lastActivityAt, true)
      : 0
  if (nowAwareActivityDelta !== 0) {
    return nowAwareActivityDelta
  }

  return left.id.localeCompare(right.id)
}

export const sortConsultationPipelineItems = (
  items: StudioConsultationPipelineApplicationItem[]
) => {
  return [...items].sort(compareConsultationPipelineItems)
}
