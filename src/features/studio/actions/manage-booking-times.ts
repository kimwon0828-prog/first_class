"use server"
import { revalidatePath } from "next/cache"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import { emptyBookingDay, type BookingClosureMutation, type BookingDay } from "../lib/booking-closures"
export async function getStudioBookingDayAction(dateKey: string): Promise<{ data: BookingDay; error: string | null }> {
  const teacher = await requireTeacherStudioAccess()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { data: emptyBookingDay(), error: "날짜를 확인해 주세요." }
  try { return { data: await dataAdapter.getStudioBookingDay(teacher.organizationId,dateKey), error: null } }
  catch { return { data: emptyBookingDay(), error: "예약 시간을 불러오지 못했습니다. 다시 시도해 주세요." } }
}
export async function manageBookingTimesAction(input: Omit<BookingClosureMutation,"organizationId">): Promise<{ changed: number; error: string | null }> {
  const teacher = await requireTeacherStudioAccess()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey) || !["close","release"].includes(input.mode) || !Array.isArray(input.slotKeys) || input.slotKeys.length>200 || (input.mode==="close"&&!input.slotKeys.length) || !Array.isArray(input.expectedTargets) || input.expectedTargets.length>10000 || !Array.isArray(input.closureIds) || input.closureIds.length>500 || (input.mode==="release"&&!input.closureIds.length) || (input.reason?.length ?? 0)>500) return { changed: 0, error: "선택한 시간과 사유를 확인해 주세요." }
  try {
    const result = await dataAdapter.mutateStudioBookingClosures({...input,organizationId:teacher.organizationId})
    try { for (const path of ["/studio/schedule","/studio/classes","/classes"]) revalidatePath(path) } catch { /* The database transaction has already committed. */ }
    return { changed: result.changed, error: null }
  } catch (e) {
    return { changed: 0, error: e instanceof Error && e.message.includes("booking_slots_changed") ? "공개 과정 또는 예약 시간이 변경됐습니다. 다시 불러온 뒤 적용 대상을 확인해 주세요." : "변경을 적용하지 못했습니다. 선택을 유지했으니 다시 시도해 주세요." }
  }
}
