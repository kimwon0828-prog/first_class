"use client"
import { ScheduleFailure, ScheduleFrame } from "@/features/schedule/ui/parent-schedule-screen"
export default function Error({ reset }: { reset: () => void }) {
  return <ScheduleFrame><ScheduleFailure retry={reset} /></ScheduleFrame>
}
