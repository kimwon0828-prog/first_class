import { AppLoading } from "@/features/classes/ui/parent-app-ui"
import { ReportFrame } from "./report-frame"
export default function Loading() {
  return <ReportFrame><AppLoading label="체험 리포트 불러오는 중" /></ReportFrame>
}
