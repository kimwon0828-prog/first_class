import "server-only"
import { cookies } from "next/headers"
import { appleRevocationConfigFromEnv } from "./apple-token-revocation"
import { openAppleDeletionGrant, sealAppleDeletionGrant } from "./apple-deletion-grant"
const secure = process.env.NODE_ENV === "production"
const prefix = secure ? "__Host-" : ""
const challengeName = `${prefix}firstsuup-apple-deletion-check`
const grantName = `${prefix}firstsuup-apple-deletion-grant`
const settings = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 300 }
export async function beginAppleDeletionReauth(userId: string) {
  const config = appleRevocationConfigFromEnv()
  if (!config) return false
  const store = await cookies()
  store.delete(grantName)
  store.set(challengeName, sealAppleDeletionGrant({ userId, expiresAt: Date.now() + 300000 }, "challenge", config.privateKey), settings)
  return true
}
export async function completeAppleDeletionReauth(userId: string, refreshToken: unknown): Promise<"none" | "ready" | "mismatch" | "unavailable"> {
  const store = await cookies(), raw = store.get(challengeName)?.value
  if (!raw) return "none"
  store.delete(challengeName); store.delete(grantName)
  const config = appleRevocationConfigFromEnv()
  if (!config) return "unavailable"
  const challenge = openAppleDeletionGrant(raw, "challenge", config.privateKey)
  if (!challenge) return "unavailable"
  if (challenge.userId !== userId) return "mismatch"
  if (typeof refreshToken !== "string" || !refreshToken || refreshToken.length > 2048) return "unavailable"
  store.set(grantName, sealAppleDeletionGrant({ userId, refreshToken, expiresAt: Date.now() + 300000 }, "grant", config.privateKey), settings)
  return "ready"
}
export async function consumeAppleDeletionGrant(userId: string): Promise<string | undefined> {
  const store = await cookies(), raw = store.get(grantName)?.value
  store.delete(grantName)
  const config = appleRevocationConfigFromEnv()
  if (!config) return undefined
  const grant = openAppleDeletionGrant(raw, "grant", config.privateKey)
  return grant?.userId === userId ? grant.refreshToken : undefined
}
