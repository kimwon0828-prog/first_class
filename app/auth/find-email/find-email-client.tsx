"use client"

import Link from "next/link"
import { useState } from "react"

type UserType = "parent" | "academy"

type FindEmailClientProps = {
  initialUserType: UserType
}

export const FindEmailClient = ({ initialUserType }: FindEmailClientProps) => {
  const [submitted, setSubmitted] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [userType, setUserType] = useState<UserType>(initialUserType)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }

  const loginHref = userType === "academy" ? "/studio/sign-in" : "/auth/sign-in"

  return (
    <main
      style={{
        background: "#ffffff",
        width: "100%",
        minHeight: "100dvh",
        overflowX: "hidden"
      }}
    >
      <div
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 430,
          minHeight: "100dvh",
          boxSizing: "border-box",
          padding: "calc(14px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))"
        }}
      >
        <header style={{ display: "flex", alignItems: "center", minHeight: 40 }}>
          <Link
            href={loginHref}
            aria-label="뒤로가기"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              color: "#8e8e93",
              fontSize: 24,
              textDecoration: "none"
            }}
          >
            〈
          </Link>
        </header>

        <h1 style={{ margin: "12px 0 0", fontSize: 24, lineHeight: "29px", fontWeight: 600, color: "#000" }}>
          이메일 찾기
        </h1>

        <section style={{ marginTop: 18, color: "#111827" }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>
            가입한 이메일을 잊으셨나요?
            <br />
            보안을 위해 이메일 전체를 바로 보여드리지는 않아요.
            <br />
            가입 시 사용한 이름과 연락처를 입력하면 확인 후 안내해드릴게요.
          </p>
        </section>

        {submitted ? (
          <section
            style={{
              marginTop: 28,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              background: "#ffffff"
            }}
          >
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#111827" }}>
              입력하신 정보로 가입 여부를 확인한 뒤 안내드릴게요.
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={loginHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  background: "#2aad38",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                로그인 화면으로
              </Link>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                다시 입력하기
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "grid", gap: 18 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
                이름
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 15,
                  lineHeight: "20px"
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
                연락처
              </span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="예: 010-1234-5678"
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 15,
                  lineHeight: "20px"
                }}
              />
            </label>

            <fieldset
              style={{
                border: 0,
                padding: 0,
                margin: 0,
                display: "grid",
                gap: 10
              }}
            >
              <legend style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
                사용자 유형
              </legend>
              <div style={{ display: "flex", gap: 12 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="radio"
                    name="userType"
                    value="parent"
                    checked={userType === "parent"}
                    onChange={() => setUserType("parent")}
                  />
                  학부모
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="radio"
                    name="userType"
                    value="academy"
                    checked={userType === "academy"}
                    onChange={() => setUserType("academy")}
                  />
                  학원
                </label>
              </div>
            </fieldset>

            <button
              type="submit"
              style={{
                marginTop: 6,
                width: "100%",
                border: 0,
                borderRadius: 10,
                background: "#2aad38",
                color: "#ffffff",
                fontSize: 16,
                lineHeight: "22px",
                fontWeight: 600,
                padding: "14px 0",
                cursor: "pointer"
              }}
            >
              확인 요청하기
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

