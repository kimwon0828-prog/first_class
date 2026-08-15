import "server-only"

import nodemailer from "nodemailer"

import { getPartnerInquiryMailEnv } from "@/shared/config/server-env"

type SendPartnerInquiryEmailInput = {
  academyName: string
  phone: string
  createdAt: string
  status: string
}

const formatInquiryDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value))

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const sendPartnerInquiryEmail = async ({
  academyName,
  phone,
  createdAt,
  status
}: SendPartnerInquiryEmailInput) => {
  const mailEnv = getPartnerInquiryMailEnv()
  if (!mailEnv) {
    throw new Error("partner_inquiry_mail_env_missing")
  }

  const formattedCreatedAt = formatInquiryDateTime(createdAt)
  const subject = "[첫수업] 새로운 학원 도입 문의가 들어왔습니다"
  const text = [
    "첫수업 파트너 랜딩페이지에서 새로운 문의가 접수되었습니다.",
    "",
    `학원명: ${academyName}`,
    `연락처: ${phone}`,
    `접수일시: ${formattedCreatedAt}`,
    `상태: ${status}`,
    "",
    "첫수업 파트너 문의"
  ].join("\n")

  const html = `
    <div style="font-family: Arial, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; line-height: 1.7; color: #111827;">
      <p>첫수업 파트너 랜딩페이지에서 새로운 문의가 접수되었습니다.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tbody>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 700;">학원명</td><td style="padding: 4px 0;">${escapeHtml(academyName)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 700;">연락처</td><td style="padding: 4px 0;">${escapeHtml(phone)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 700;">접수일시</td><td style="padding: 4px 0;">${escapeHtml(formattedCreatedAt)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 700;">상태</td><td style="padding: 4px 0;">${escapeHtml(status)}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 24px;">첫수업 파트너 문의</p>
    </div>
  `

  const transporter = nodemailer.createTransport({
    host: mailEnv.host,
    port: mailEnv.port,
    secure: mailEnv.port === 465,
    auth: {
      user: mailEnv.user,
      pass: mailEnv.password
    }
  })

  await transporter.sendMail({
    from: mailEnv.user,
    to: mailEnv.to,
    subject,
    text,
    html
  })
}
