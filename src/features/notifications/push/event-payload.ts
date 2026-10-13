import type { PushPayload } from "./confirmed-transport"
export type ParentPushEvent = "schedule_changed" | "report_published" | "feedback_reminder"
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
export function parentEventPayload(event: ParentPushEvent, applicationId: string, notificationId: string): PushPayload {
 if (!["schedule_changed", "report_published", "feedback_reminder"].includes(event)
  || !new RegExp(`^${uuid}$`, "i").test(applicationId) || !new RegExp(`^${event}:${uuid}$`, "i").test(notificationId)) throw Error("invalid_parent_push_event")
 const report = `/record/${applicationId}/report`
 const messages = {
  schedule_changed: { title: "체험 일정이 변경됐어요.", body: "앱에서 변경된 일정을 확인해 주세요.", path: "/my/schedule" },
  report_published: { title: "체험수업 리포트가 도착했어요", body: "수업에서 발견한 아이의 모습을 확인해 주세요.", path: report },
  feedback_reminder: { title: "체험은 어떠셨나요?", body: "리포트를 확인하고 학부모님의 생각을 남겨 주세요.", path: `${report}#experience-feedback` }
 }
 const item = messages[event]
 return { title: item.title, body: item.body, data: { type: event, path: item.path, notificationId } }
}
