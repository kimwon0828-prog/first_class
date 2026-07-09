"use client"

import Link from "next/link"
import { useActionState, useEffect, useState, type FormEvent } from "react"

import { signUpParentAction, type SignUpActionState } from "@/features/auth/actions/sign-up"
import { KakaoAuthButton } from "@/features/auth/ui/kakao-auth-button"
import styles from "./sign-up-form.module.css"

type SignUpFormProps = {
  returnTo?: string
}

const MIN_PARENT_BIRTH_DATE = "1900-01-01"

const getTodayDateValue = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const validateParentBirthDate = (value: string) => {
  const normalized = value.trim()
  if (!normalized) {
    return "생년월일을 입력해 주세요."
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "생년월일을 YYYY-MM-DD 형식으로 입력해 주세요."
  }

  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return "올바른 생년월일을 입력해 주세요."
  }

  if (normalized < MIN_PARENT_BIRTH_DATE) {
    return "생년월일은 1900-01-01 이후로 입력해 주세요."
  }

  if (normalized > getTodayDateValue()) {
    return "미래 날짜는 생년월일로 입력할 수 없습니다."
  }

  return null
}

const initialState: SignUpActionState = {
  status: "idle",
  message: ""
}

export const SignUpForm = ({ returnTo }: SignUpFormProps) => {
  const [state, formAction, isPending] = useActionState(signUpParentAction, initialState)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [parentBirthDate, setParentBirthDate] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [thirdPartyAgreed, setThirdPartyAgreed] = useState(false)
  const [clientMessage, setClientMessage] = useState("")
  const signInHref = returnTo
    ? `/auth/sign-in/email?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-in/email"

  const message = clientMessage || state.message
  const messageStatus = clientMessage ? "error" : state.status
  const requiredAgreementChecked = termsAgreed && privacyAgreed && thirdPartyAgreed
  const maxBirthDate = getTodayDateValue()

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      window.location.href = state.redirectTo
    }
  }, [state.redirectTo, state.status])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (isPending) {
      event.preventDefault()
      return
    }

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (trimmedName.length < 2) {
      event.preventDefault()
      setClientMessage("보호자명은 2자 이상 입력해 주세요.")
      return
    }

    if (trimmedPhone.length < 8) {
      event.preventDefault()
      setClientMessage("보호자 연락처를 올바르게 입력해 주세요.")
      return
    }

    const parentBirthDateError = validateParentBirthDate(parentBirthDate)
    if (parentBirthDateError) {
      event.preventDefault()
      setClientMessage(parentBirthDateError)
      return
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      event.preventDefault()
      setClientMessage("올바른 이메일을 입력해 주세요.")
      return
    }

    if (password.length < 8) {
      event.preventDefault()
      setClientMessage("비밀번호는 8자 이상이어야 합니다.")
      return
    }

    if (password !== passwordConfirm) {
      event.preventDefault()
      setClientMessage("비밀번호 확인이 일치하지 않습니다.")
      return
    }

    if (!requiredAgreementChecked) {
      event.preventDefault()
      setClientMessage("필수 약관에 모두 동의해주세요.")
      return
    }

    setClientMessage("")
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <section className={styles.card} aria-label="회원가입 정보 입력">
        <KakaoAuthButton
          label="카카오로 시작하기"
          next={returnTo ?? "/classes"}
          className={styles.kakaoButton}
        />

        <div className={styles.divider} aria-hidden="true">
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>또는 이메일로 회원가입</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.fieldStack}>
          <label className={styles.field}>
            <span className={styles.label}>이메일</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isPending}
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="8자 이상"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호 확인</span>
            <input
              name="passwordConfirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>보호자명</span>
            <input
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={30}
              disabled={isPending}
              className={styles.input}
              placeholder="보호자 이름"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>보호자 연락처</span>
            <input
              name="phone"
              type="tel"
              required
              minLength={8}
              maxLength={20}
              autoComplete="tel"
              placeholder="010-0000-0000"
              disabled={isPending}
              className={styles.input}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>생년월일</span>
            <input
              name="parentBirthDate"
              type="date"
              required
              min={MIN_PARENT_BIRTH_DATE}
              max={maxBirthDate}
              autoComplete="bday"
              disabled={isPending}
              className={styles.input}
              value={parentBirthDate}
              onChange={(event) => setParentBirthDate(event.target.value)}
              aria-describedby="parent-birth-date-hint"
            />
            <span id="parent-birth-date-hint" className={styles.fieldHint}>
              학부모님의 생년월일을 입력해주세요.
            </span>
          </label>
        </div>

        <div className={styles.agreementCard}>
          <h2 className={styles.agreementTitle}>필수 동의</h2>
          <div className={styles.agreementStack}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="termsAgreed"
                value="yes"
                disabled={isPending}
                className={styles.checkbox}
                checked={termsAgreed}
                onChange={(event) => setTermsAgreed(event.target.checked)}
              />
              <span className={styles.checkText}>
                <span className={styles.requiredText}>[필수]</span> 이용약관에 동의합니다.{" "}
                <Link href="/terms" target="_blank" rel="noreferrer" className={styles.inlineLink}>
                  전문 보기
                </Link>
              </span>
            </label>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="privacyAgreed"
                value="yes"
                disabled={isPending}
                className={styles.checkbox}
                checked={privacyAgreed}
                onChange={(event) => setPrivacyAgreed(event.target.checked)}
              />
              <span className={styles.checkText}>
                <span className={styles.requiredText}>[필수]</span> 개인정보 수집 및 이용에 동의합니다.{" "}
                <Link href="/privacy" target="_blank" rel="noreferrer" className={styles.inlineLink}>
                  전문 보기
                </Link>
              </span>
            </label>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="thirdPartyAgreed"
                value="yes"
                disabled={isPending}
                className={styles.checkbox}
                checked={thirdPartyAgreed}
                onChange={(event) => setThirdPartyAgreed(event.target.checked)}
              />
              <span className={styles.checkText}>
                <span className={styles.requiredText}>[필수]</span> 개인정보 제3자 제공에 동의합니다.{" "}
                <Link
                  href="/third-party-consent"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.inlineLink}
                >
                  전문 보기
                </Link>
              </span>
            </label>
          </div>
        </div>

        <p className={styles.helperText}>
          자녀 정보는 가입 후 마이페이지의 자녀 관리에서 등록하거나, 첫수업 신청 과정에서 직접 입력할 수 있어요.
        </p>

        {message ? (
          <p
            className={`${styles.message} ${messageStatus === "error" ? styles.errorMessage : styles.infoMessage}`}
          >
            {message}
          </p>
        ) : null}

        <div className={styles.loginRow}>
          이미 계정이 있으신가요?{" "}
          <Link href={signInHref} className={styles.loginLink}>
            로그인
          </Link>
        </div>
      </section>

      <div className={styles.fixedBar}>
        <div className={styles.fixedBarInner}>
          <button type="submit" disabled={isPending} className={styles.submitButton}>
            {isPending ? "가입 처리 중..." : "회원가입"}
          </button>
        </div>
      </div>
    </form>
  )
}
