import { AppLoading } from "@/features/classes/ui/parent-app-ui"
import { MyFrame } from "./my-frame"
export default function Loading() {
  return <MyFrame><AppLoading label="마이 불러오는 중" /></MyFrame>
}
