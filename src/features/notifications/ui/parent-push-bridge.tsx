"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { parsePushDevice, PUSH_BRIDGE, safePushPath } from "../push/contracts"

type NativeWindow = Window & { ReactNativeWebView?: { postMessage(value: string): void } }
/** Web session, not native payload, determines account ownership on the API. */
export function ParentPushBridge() {
  const pathname = usePathname(), router = useRouter()
  const [parent, setParent] = useState(false)
  const [status, setStatus] = useState("")
  const [permission, setPermission] = useState("")
  useEffect(() => {
    const native = (window as NativeWindow).ReactNativeWebView
    if (!native) return
    let disposed = false, requestId = "", refreshVersion = 0
    const send = (message: object) => native.postMessage(JSON.stringify({ channel: PUSH_BRIDGE, ...message }))
    const refresh = async () => {
      const version = ++refreshVersion
      try {
        const response = await fetch("/api/parent/push-devices", { cache: "no-store" })
        const result = await response.json()
        if (disposed || version !== refreshVersion) return
        const authenticated = response.ok && result.enabled === true && result.parent === true
        setParent(authenticated)
        requestId = crypto.randomUUID()
        send({ type: "READY", requestId, parent: authenticated })
      } catch { if (!disposed) setStatus("알림 연결을 확인하지 못했어요. 다시 연결하면 재시도합니다.") }
    }
    const receive = async (event: Event) => {
      const message = (event as CustomEvent).detail
      if (!message || message.channel !== PUSH_BRIDGE) return
      if (message.type === "PING") { await refresh(); return }
      if (message.type === "NAVIGATE" && safePushPath(message.path)) {
        router.push(message.path)
        send({ type: "NAVIGATED", notificationId: message.notificationId })
        return
      }
      if (message.requestId !== requestId) return
      if (message.type === "ERROR") { setStatus("알림을 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); return }
      if (message.type !== "DEVICE") return
      const device = parsePushDevice(message.device)
      if (!device) return
      setPermission(device.permissionStatus)
      try {
        const response = await fetch("/api/parent/push-devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(device) })
        if (disposed || message.requestId !== requestId) return
        setStatus(response.ok ? device.permissionStatus === "granted" ? "테스트 알림을 받을 준비가 됐어요." : "알림은 기기 설정에서 켤 수 있어요." : "알림 등록에 실패했어요. 다시 시도해 주세요.")
      } catch { if (!disposed) setStatus("알림 등록에 실패했어요. 연결 후 다시 시도해 주세요.") }
    }
    const listener = (event: Event) => { void receive(event) }
    window.addEventListener(PUSH_BRIDGE, listener)
    window.addEventListener("online", refresh)
    window.addEventListener("pageshow", refresh)
    window.addEventListener("focus", refresh)
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange(() => { setTimeout(() => { if (!disposed) void refresh() }, 0) })
    void refresh()
    return () => { disposed = true; subscription.unsubscribe(); window.removeEventListener(PUSH_BRIDGE, listener); window.removeEventListener("online", refresh); window.removeEventListener("pageshow", refresh); window.removeEventListener("focus", refresh) }
  }, [pathname, router])
  if (!parent || pathname !== "/my") return null
  return <aside aria-label="앱 알림 설정" style={{ maxWidth: 480, margin: "0 auto", padding: "12px 20px", background: "#fff", wordBreak: "keep-all" }}>
    <p>알림을 허용하면 연결 확인용 테스트 알림을 받을 수 있어요.</p>
    <button type="button" style={{ minHeight: 44 }} onClick={() => {
      (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ channel: PUSH_BRIDGE, type: permission === "denied" ? "OPEN_SETTINGS" : "REQUEST_PERMISSION" }))
    }}>{permission === "denied" ? "알림 설정 열기" : permission === "granted" ? "알림 연결 다시 확인" : "알림 켜기"}</button>
    {status ? <p role="status">{status}</p> : null}
  </aside>
}
