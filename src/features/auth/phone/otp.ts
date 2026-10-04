import "server-only"
import { createHmac, randomInt } from "node:crypto"
export function otpConfigurationReady() {
  return process.env.PHONE_OTP_ENABLED === "true" && process.env.SMS_SEND_ENABLED === "true" &&
    process.env.SMS_PROVIDER?.trim().toLowerCase() === "ncloud" && (process.env.PARENT_PHONE_OTP_HMAC_SECRET?.length ?? 0) >= 32 &&
    ["NCP_ACCESS_KEY", "NCP_SECRET_KEY", "NCP_SENS_SMS_SERVICE_ID", "NCP_SENS_SMS_FROM_NUMBER"].every(key => Boolean(process.env[key]?.trim()))
}
export function hashPhoneOtp(challenge: string, user: string, code: string) {
  const secret = process.env.PARENT_PHONE_OTP_HMAC_SECRET
  if (!secret || secret.length < 32) throw new Error("phone_otp_not_configured")
  return createHmac("sha256", secret).update(`otp:${challenge}:${user}:${code}`).digest("hex")
}
export function hashOtpIp(ip: string) {
  return createHmac("sha256", process.env.PARENT_PHONE_OTP_HMAC_SECRET!).update(`ip:${ip}`).digest("hex")
}
export function generatePhoneOtp() { return randomInt(0, 1_000_000).toString().padStart(6, "0") }
