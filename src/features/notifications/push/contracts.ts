export const PUSH_BRIDGE = "firstsuup.push.v1"
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
export function safePushPath(value: unknown): value is string {
  return typeof value === "string" && (value === "/notifications" || value === "/my/schedule" || new RegExp(`^/record/${uuid}/report(?:#experience-feedback)?$`).test(value))
}
export type PushDeviceInput = {
  installationId: string; installationSecret: string; expoPushToken: string | null;
  platform: "ios" | "android"; permissionStatus: "granted" | "denied" | "undetermined";
  appVersion: string | null
}
export function parsePushDevice(value: unknown): PushDeviceInput | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(key => !["installationId", "installationSecret", "expoPushToken", "platform", "permissionStatus", "appVersion"].includes(key))) return null
  if (typeof v.installationId !== "string" || !new RegExp(`^${uuid}$`).test(v.installationId) || typeof v.installationSecret !== "string" || !/^[0-9a-f]{64}$/.test(v.installationSecret)) return null
  if (v.platform !== "ios" && v.platform !== "android") return null
  if (!["granted", "denied", "undetermined"].includes(String(v.permissionStatus))) return null
  if (v.expoPushToken !== null && (typeof v.expoPushToken !== "string" || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(v.expoPushToken))) return null
  if (v.permissionStatus === "granted" && !v.expoPushToken) return null
  if (v.appVersion !== null && (typeof v.appVersion !== "string" || v.appVersion.length > 50)) return null
  return v as PushDeviceInput
}
