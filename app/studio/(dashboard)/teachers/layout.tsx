import type { ReactNode } from "react"

import { StudioSettingsFrame } from "@/features/studio/ui/studio-settings-frame"

/* 설정 탭으로 묶인 화면. URL 은 그대로 두고 틀만 씌운다(studio-nav.ts STUDIO_SETTINGS_TABS). */
export default function StudioSettingsSectionLayout({ children }: { children: ReactNode }) {
  return <StudioSettingsFrame>{children}</StudioSettingsFrame>
}
