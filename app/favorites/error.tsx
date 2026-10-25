"use client"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { FavoritesFrame } from "./favorites-frame"
export default function ErrorPage() { return <FavoritesFrame><div className={ui.notice} role="alert"><p className={ui.body}>관심수업을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><AppButton variant="secondary" onClick={() => window.location.reload()}>다시 시도</AppButton></div></FavoritesFrame> }
