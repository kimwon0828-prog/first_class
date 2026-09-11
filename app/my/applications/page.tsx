import { redirect } from "next/navigation"

// "내 신청" 은 "기록" 으로 옮겼다.
//
// 이 경로는 지우지 않는다 — 신청 완료 redirect 와 기존 알림·북마크가 아직 이 URL 을
// 가리킨다. 같은 화면을 두 벌 만들지 않고 새 경로로 넘긴다.
export default function MyApplicationsPage() {
  redirect("/record")
}
