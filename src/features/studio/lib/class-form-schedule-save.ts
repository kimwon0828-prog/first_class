import type { StudioClassScheduleItem, StudioClassScheduleSlotInput } from "@/shared/lib/db/adapter"

// Includes reservation references: a newly booked schedule must also invalidate a pending bulk edit.
export const classScheduleSnapshot = (schedules: StudioClassScheduleItem[]) => JSON.stringify(
  schedules.map((slot) => ({
    id: slot.id, scheduleType: slot.scheduleType, dayOfWeek: slot.dayOfWeek,
    specificDate: slot.specificDate, startTime: slot.startTime.slice(0, 5), endTime: slot.endTime.slice(0, 5),
    capacity: slot.capacity, bookingStatus: slot.bookingStatus ?? "open", seriesId: slot.seriesId ?? null,
    displayLabel: slot.displayLabel ?? null, referenced: Boolean(slot.isReferencedByApplications),
    applicationCount: slot.applicationCount ?? 0
  })).sort((a, b) => a.id.localeCompare(b.id))
)

export const resolveClassFormScheduleSave = (
  writeMode: string,
  baseline: string,
  submitted: StudioClassScheduleSlotInput[],
  latest: StudioClassScheduleItem[]
): { ok: true; slots: StudioClassScheduleSlotInput[] } | { ok: false; message: string } => {
  if (writeMode === "preserve") {
    // Never replay the form's stale schedule array after an immediate operation.
    return { ok: true, slots: latest.map((slot, sortOrder) => ({
      id: slot.id, scheduleType: slot.scheduleType, dayOfWeek: slot.dayOfWeek,
      specificDate: slot.specificDate, startTime: slot.startTime.slice(0, 5), endTime: slot.endTime.slice(0, 5),
      capacity: slot.capacity, bookingStatus: slot.bookingStatus ?? "open", seriesId: slot.seriesId ?? null,
      displayLabel: slot.displayLabel ?? null, sortOrder
    })) }
  }
  if (writeMode === "replace" && baseline !== classScheduleSnapshot(latest)) {
    return { ok: false, message: "예약시간이 다른 작업에서 변경되었습니다. 저장된 예약시간을 다시 불러온 뒤 기본 운영시간을 확인해 주세요. 다른 입력 내용은 유지됩니다." }
  }
  // Existing callers without the V1 write mode retain their original contract.
  return { ok: true, slots: submitted }
}
