/** Operator-invoked foundation test only. No route, worker, event hook or retry calls this. */
export async function sendExpoTestPush(token: string, notificationId: string, request: typeof fetch = fetch) {
  if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token) ||
      !/^test:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) throw new Error("invalid_push_test");
  try {
    const response = await request("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify({ to: token, title: "첫수업 알림 테스트", body: "알림이 정상적으로 연결되었어요.", sound: "default",
        data: { type: "test", path: "/notifications", notificationId } })
    });
    if (!response.ok) return { status: response.status >= 500 ? "unknown" : "rejected", httpStatus: response.status } as const;
    const body = await response.json();
    if (body.data?.status === "ok" && typeof body.data.id === "string") return { status: "accepted", ticketId: body.data.id, httpStatus: response.status } as const;
    if (body.data?.status === "error") return { status: "rejected", category: body.data.details?.error === "DeviceNotRegistered" ? "DeviceNotRegistered" : "provider_error", httpStatus: response.status } as const;
    return { status: "unknown", httpStatus: response.status } as const;
  } catch { return { status: "unknown" } as const; }
}
