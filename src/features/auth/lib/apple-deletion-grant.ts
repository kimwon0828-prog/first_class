import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

export type AppleDeletionGrant = { userId: string; expiresAt: number; refreshToken?: string }
type Purpose = "challenge" | "grant"
const context = "firstsuup.apple-deletion.v1"
const derive = (secret: string) => createHash("sha256").update(`${context}\0${secret}`).digest()
export function sealAppleDeletionGrant(value: AppleDeletionGrant, purpose: Purpose, secret: string, now = Date.now()): string {
  if (!secret || !value.userId || value.expiresAt <= now || value.expiresAt > now + 300000 ||
    (purpose === "grant" && (!value.refreshToken || value.refreshToken.length > 2048))) throw new Error("invalid_apple_grant")
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", derive(secret), iv)
  cipher.setAAD(Buffer.from(`${context}.${purpose}`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".")
}
export function openAppleDeletionGrant(raw: string | undefined, purpose: Purpose, secret: string, now = Date.now()): AppleDeletionGrant | null {
  try {
    if (!raw || !secret || raw.length > 3800) return null
    const [version, iv, tag, encrypted, extra] = raw.split(".")
    if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) return null
    const decipher = createDecipheriv("aes-256-gcm", derive(secret), Buffer.from(iv, "base64url"))
    decipher.setAAD(Buffer.from(`${context}.${purpose}`)); decipher.setAuthTag(Buffer.from(tag, "base64url"))
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8"))
    if (!value || typeof value.userId !== "string" || !value.userId || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 300000) return null
    if (purpose === "grant" && (typeof value.refreshToken !== "string" || !value.refreshToken || value.refreshToken.length > 2048)) return null
    return value
  } catch { return null }
}
