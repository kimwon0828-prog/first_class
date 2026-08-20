"use client"

import Image from "next/image"
import Link from "next/link"
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react"

import { academyAreaConfigs, getDefaultAcademyArea } from "@/shared/config/academy-areas"
import {
  studioSignUpAction,
  type StudioSignUpActionState
} from "@/features/studio/actions/studio-sign-up"
import styles from "@/features/studio/ui/studio-sign-up-form.module.css"

const initialState: StudioSignUpActionState = {
  status: "idle",
  message: ""
}

const KAKAO_POSTCODE_SCRIPT_SRC =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
const MAX_BUSINESS_REGISTRATION_FILE_SIZE = 5 * 1024 * 1024
const BUSINESS_REGISTRATION_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp"
const ALLOWED_BUSINESS_REGISTRATION_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
])

type KakaoPostcodeResult = {
  zonecode?: string
  roadAddress?: string
  jibunAddress?: string
  userSelectedType?: "R" | "J"
}

type KakaoPostcodeInstance = {
  open: () => void
}

type KakaoPostcodeConstructor = new (options: {
  oncomplete: (data: KakaoPostcodeResult) => void
}) => KakaoPostcodeInstance

declare global {
  interface Window {
    kakao?: {
      Postcode?: KakaoPostcodeConstructor
    }
  }
}

let kakaoPostcodeScriptPromise: Promise<KakaoPostcodeConstructor> | null = null

const formatBusinessRegistrationNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10)

  if (digits.length <= 3) {
    return digits
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

const isBusinessRegistrationNumberValid = (value: string) => /^\d{3}-\d{2}-\d{5}$/.test(value)

const isPasswordValid = (value: string) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}MB`
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)}KB`
  }

  return `${value}B`
}

const getBusinessRegistrationFileError = (file: File) => {
  if (file.size > MAX_BUSINESS_REGISTRATION_FILE_SIZE) {
    return "사업자등록증 파일은 5MB 이하만 업로드할 수 있습니다."
  }

  if (!ALLOWED_BUSINESS_REGISTRATION_MIME_TYPES.has(file.type)) {
    return "사업자등록증 파일은 PDF, JPG, PNG, WEBP 형식만 업로드할 수 있습니다."
  }

  return null
}

const FieldLabel = ({
  text,
  required = false,
  optional = false,
  error = false
}: {
  text: string
  required?: boolean
  optional?: boolean
  error?: boolean
}) => {
  return (
    <span className={`${styles.label} ${error ? styles.labelError : ""}`}>
      {text}
      {required ? <span className={styles.requiredMark}>*</span> : null}
      {optional ? <span className={styles.optionalText}>(선택)</span> : null}
    </span>
  )
}

const loadKakaoPostcode = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("browser_only"))
  }

  if (window.kakao?.Postcode) {
    return Promise.resolve(window.kakao.Postcode)
  }

  if (kakaoPostcodeScriptPromise) {
    return kakaoPostcodeScriptPromise
  }

  kakaoPostcodeScriptPromise = new Promise<KakaoPostcodeConstructor>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${KAKAO_POSTCODE_SCRIPT_SRC}"]`)

    const handleLoad = () => {
      const postcode = window.kakao?.Postcode
      if (postcode) {
        resolve(postcode)
        return
      }

      kakaoPostcodeScriptPromise = null
      reject(new Error("postcode_constructor_missing"))
    }

    const handleError = () => {
      kakaoPostcodeScriptPromise = null
      reject(new Error("postcode_script_load_failed"))
    }

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true })
      existingScript.addEventListener("error", handleError, { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = KAKAO_POSTCODE_SCRIPT_SRC
    script.async = true
    script.addEventListener("load", handleLoad, { once: true })
    script.addEventListener("error", handleError, { once: true })
    document.body.appendChild(script)
  })

  return kakaoPostcodeScriptPromise
}

export const StudioSignUpForm = () => {
  const [state, formAction, isPending] = useActionState(studioSignUpAction, initialState)
  const [postalCode, setPostalCode] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState("")
  const [businessRegistrationNumberTouched, setBusinessRegistrationNumberTouched] = useState(false)
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [marketingAgreed, setMarketingAgreed] = useState(false)
  const [agreementError, setAgreementError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const businessRegistrationFileRef = useRef<HTMLInputElement | null>(null)
  const allAgreementRef = useRef<HTMLInputElement | null>(null)

  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm
  const passwordRuleError =
    (hasAttemptedSubmit || password.length >= 8) && password.length > 0 && !isPasswordValid(password)
      ? "영문과 숫자를 포함해 8자 이상 입력해 주세요."
      : null
  const businessRegistrationNumberError =
    (hasAttemptedSubmit || businessRegistrationNumberTouched) &&
    businessRegistrationNumber.length > 0 &&
    !isBusinessRegistrationNumberValid(businessRegistrationNumber)
      ? "사업자등록번호 10자리를 정확히 입력해 주세요."
      : null
  const requiredAgreementMissing = !termsAgreed || !privacyAgreed
  const allAgreed = termsAgreed && privacyAgreed && marketingAgreed
  const isSubmitDisabledByValidation = requiredAgreementMissing || passwordMismatch
  const isSubmitDisabled = isPending || isSubmitDisabledByValidation

  useEffect(() => {
    if (!allAgreementRef.current) {
      return
    }

    allAgreementRef.current.indeterminate =
      !allAgreed && (termsAgreed || privacyAgreed || marketingAgreed)
  }, [allAgreed, marketingAgreed, privacyAgreed, termsAgreed])

  useEffect(() => {
    if (requiredAgreementMissing) {
      return
    }

    setAgreementError(null)
  }, [requiredAgreementMissing])

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      setFilePreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setFilePreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [selectedFile])

  const handleAgreementValidation = () => {
    if (requiredAgreementMissing) {
      setAgreementError("이용약관 및 개인정보 수집·이용에 동의해 주세요.")
      return false
    }

    setAgreementError(null)
    return true
  }

  const handleDisabledSubmitAttempt = () => {
    setHasAttemptedSubmit(true)
    handleAgreementValidation()
  }

  const clearSelectedFile = () => {
    setSelectedFile(null)
    setFilePreviewUrl(null)
    setFileError(null)

    if (businessRegistrationFileRef.current) {
      businessRegistrationFileRef.current.value = ""
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    if (!file) {
      clearSelectedFile()
      return
    }

    const nextFileError = getBusinessRegistrationFileError(file)
    if (nextFileError) {
      clearSelectedFile()
      setFileError(nextFileError)
      return
    }

    setSelectedFile(file)
    setFileError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setHasAttemptedSubmit(true)

    let hasCustomError = false

    if (!handleAgreementValidation()) {
      hasCustomError = true
    }

    if (!isBusinessRegistrationNumberValid(businessRegistrationNumber)) {
      hasCustomError = true
    }

    if (!selectedFile) {
      setFileError("사업자등록증 파일을 첨부해 주세요.")
      hasCustomError = true
    }

    if (!isPasswordValid(password)) {
      hasCustomError = true
    }

    if (password !== passwordConfirm) {
      hasCustomError = true
    }

    if (hasCustomError) {
      event.preventDefault()
    }
  }

  const handleAddressSearch = async () => {
    setPostcodeError(null)
    setIsSearchingAddress(true)

    try {
      const Postcode = await loadKakaoPostcode()

      new Postcode({
        oncomplete: (data) => {
          const selectedAddress =
            data.userSelectedType === "R"
              ? data.roadAddress?.trim() || data.jibunAddress?.trim() || ""
              : data.jibunAddress?.trim() || data.roadAddress?.trim() || ""

          setPostalCode(data.zonecode?.trim() || "")
          setAddressLine1(selectedAddress)
          setAddressLine2("")

          window.setTimeout(() => {
            detailAddressRef.current?.focus()
          }, 0)
        }
      }).open()

      setIsSearchingAddress(false)
    } catch (error) {
      console.error("[studio sign-up postcode load failed]", error)
      setPostcodeError("주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
      setIsSearchingAddress(false)
    }
  }

  return (
    <form action={formAction} className={styles.form} encType="multipart/form-data" onSubmit={handleSubmit}>
      {state.status === "success" ? (
        <div className={styles.successCard} role="status" aria-live="polite">
          <div className={styles.successIcon} aria-hidden="true" />
          <div className={styles.successBody}>
            <p className={styles.successTitle}>학원 계정 신청이 접수되었습니다.</p>
            <p className={styles.successDescription}>
              관리자 승인 후{" "}
              <Link href="/studio/sign-in" className={styles.inlineLink}>
                운영보드 로그인
              </Link>
              이 가능합니다.
            </p>
          </div>
        </div>
      ) : null}

      <label className={styles.field}>
        <FieldLabel text="학원명" required />
        <input
          name="organizationName"
          type="text"
          required
          minLength={2}
          maxLength={50}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 첫수업 강남학원"
        />
      </label>

      <label className={styles.field}>
        <FieldLabel text="학원가" required />
        <select
          name="academyArea"
          required
          disabled={isPending}
          className={styles.input}
          defaultValue={getDefaultAcademyArea()}
        >
          <option value="" disabled>
            학원가를 선택해 주세요
          </option>
          {academyAreaConfigs.map((option) => (
            <option key={option.value} value={option.value} disabled={!option.enabled}>
              {option.statusLabel ? `${option.value} · ${option.statusLabel}` : option.value}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <FieldLabel text="지점명" optional />
        <input
          name="branchName"
          type="text"
          maxLength={30}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 강남점"
        />
      </label>

      <label className={styles.field}>
        <FieldLabel text="대표자명" required />
        <input
          name="representativeName"
          type="text"
          required
          minLength={2}
          maxLength={40}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 홍길동"
        />
      </label>

      <label className={styles.field}>
        <FieldLabel
          text="사업자등록번호"
          required
          error={Boolean(businessRegistrationNumberError)}
        />
        <input
          name="businessRegistrationNumber"
          type="text"
          required
          maxLength={12}
          disabled={isPending}
          className={`${styles.input} ${businessRegistrationNumberError ? styles.inputError : ""}`}
          placeholder="예: 123-45-67890"
          value={businessRegistrationNumber}
          onChange={(event) => {
            setBusinessRegistrationNumber(formatBusinessRegistrationNumber(event.target.value))
          }}
          onBlur={() => {
            setBusinessRegistrationNumberTouched(true)
          }}
        />
        {businessRegistrationNumberError ? (
          <p className={styles.inlineErrorText}>{businessRegistrationNumberError}</p>
        ) : null}
      </label>

      <label className={styles.field}>
        <FieldLabel text="학원 대표 전화번호" required />
        <input
          name="academyPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 02-1234-5678"
        />
        <p className={styles.fieldHint}>학부모에게 노출되는 번호입니다.</p>
      </label>

      <label className={styles.field}>
        <FieldLabel text="담당자 전화번호" required />
        <input
          name="contactPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 010-1234-5678"
        />
        <p className={styles.fieldHint}>
          체험수업 신청 알림 문자를 받으실 번호입니다. 실제로 확인 가능한 번호를 입력해 주세요.
        </p>
      </label>

      <label className={styles.field}>
        <FieldLabel text="우편번호" optional />
        <input
          name="postalCode"
          type="text"
          maxLength={20}
          disabled={isPending}
          readOnly
          className={styles.input}
          placeholder="예: 12345"
          value={postalCode}
        />
      </label>

      <div className={styles.field}>
        <FieldLabel text="기본 주소" required />
        <div className={styles.addressSearchRow}>
          <input
            name="addressLine1"
            type="text"
            required
            maxLength={120}
            disabled={isPending}
            readOnly
            className={styles.input}
            placeholder="주소 검색으로 주소를 선택해 주세요"
            value={addressLine1}
          />
          <button
            type="button"
            disabled={isPending || isSearchingAddress}
            className={styles.addressSearchButton}
            onClick={() => {
              void handleAddressSearch()
            }}
          >
            {isSearchingAddress ? "검색 준비 중..." : "주소 검색"}
          </button>
        </div>
        <p className={styles.fieldHint}>학부모에게 노출되는 위치 정보입니다. 정확한 주소를 입력해주세요.</p>
        {postcodeError ? <p className={styles.errorMessage}>{postcodeError}</p> : null}
      </div>

      <label className={styles.field}>
        <FieldLabel text="상세 주소" optional />
        <input
          name="addressLine2"
          type="text"
          maxLength={120}
          disabled={isPending}
          className={styles.input}
          placeholder="예) 5층 500-7호"
          value={addressLine2}
          onChange={(event) => setAddressLine2(event.target.value)}
          ref={detailAddressRef}
        />
      </label>

      <div className={styles.field}>
        <FieldLabel text="사업자등록증" required error={Boolean(fileError)} />
        <input
          ref={businessRegistrationFileRef}
          name="businessRegistrationFile"
          type="file"
          required
          accept={BUSINESS_REGISTRATION_ACCEPT}
          disabled={isPending}
          className={styles.hiddenFileInput}
          onChange={handleFileChange}
        />
        <div className={`${styles.uploadBox} ${fileError ? styles.uploadBoxError : ""}`}>
          <div className={styles.uploadPreview}>
            {selectedFile ? (
              selectedFile.type.startsWith("image/") && filePreviewUrl ? (
                <Image
                  src={filePreviewUrl}
                  alt={`${selectedFile.name} 미리보기`}
                  className={styles.uploadPreviewImage}
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                <div className={styles.uploadDocumentIcon} aria-hidden="true">
                  PDF
                </div>
              )
            ) : (
              <div className={styles.uploadPlaceholderIcon} aria-hidden="true" />
            )}
          </div>
          <div className={styles.uploadTextBlock}>
            {selectedFile ? (
              <>
                <p className={styles.uploadFileName}>{selectedFile.name}</p>
                <p className={styles.uploadFileMeta}>{formatFileSize(selectedFile.size)}</p>
              </>
            ) : (
              <>
                <p className={styles.uploadPlaceholderTitle}>파일 선택</p>
                <p className={styles.uploadPlaceholderText}>
                  사업자등록증 파일을 선택해 주세요.
                </p>
              </>
            )}
          </div>
          <div className={styles.uploadActionRow}>
            <button
              type="button"
              disabled={isPending}
              className={styles.uploadActionButton}
              onClick={() => {
                businessRegistrationFileRef.current?.click()
              }}
            >
              {selectedFile ? "파일 변경" : "파일 선택"}
            </button>
            {selectedFile ? (
              <button
                type="button"
                disabled={isPending}
                className={styles.uploadDeleteButton}
                onClick={() => {
                  clearSelectedFile()
                }}
              >
                삭제
              </button>
            ) : null}
          </div>
        </div>
        <p className={styles.fieldHint}>
          PDF, JPG, PNG, WEBP 파일을 업로드할 수 있으며 최대 5MB까지 지원합니다.
        </p>
        {fileError ? <p className={styles.inlineErrorText}>{fileError}</p> : null}
      </div>

      <p className={styles.bottomHint}>입력한 주소와 연락처는 가입 심사 및 학원 공식 정보 검토에 사용됩니다.</p>

      <label className={styles.field}>
        <FieldLabel text="이메일 (아이디)" required />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <div className={styles.field}>
        <FieldLabel text="비밀번호" required error={Boolean(passwordRuleError)} />
        <div className={`${styles.inputWithAction} ${passwordRuleError ? styles.inputWithActionError : ""}`}>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            disabled={isPending}
            className={`${styles.input} ${styles.inputWithButtonPadding}`}
            placeholder="영문, 숫자 포함 8자 이상"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            disabled={isPending}
            className={styles.inputActionButton}
            onClick={() => {
              setShowPassword((current) => !current)
            }}
          >
            <span
              className={`${styles.eyeIcon} ${showPassword ? styles.eyeIconOpen : styles.eyeIconClosed}`}
              aria-hidden="true"
            />
            <span className={styles.srOnly}>{showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}</span>
          </button>
        </div>
        <p className={styles.fieldHint}>영문과 숫자를 포함해 8자 이상 입력해 주세요.</p>
        {passwordRuleError ? <p className={styles.inlineErrorText}>{passwordRuleError}</p> : null}
      </div>

      <div className={styles.field}>
        <FieldLabel
          text="비밀번호 확인"
          required
          error={hasAttemptedSubmit && passwordConfirm.length === 0 ? true : passwordMismatch}
        />
        <div
          className={`${styles.inputWithAction} ${
            hasAttemptedSubmit && passwordConfirm.length === 0 ? styles.inputWithActionError : ""
          } ${passwordMismatch ? styles.inputWithActionError : ""}`}
        >
          <input
            type={showPasswordConfirm ? "text" : "password"}
            required
            autoComplete="new-password"
            disabled={isPending}
            className={`${styles.input} ${styles.inputWithButtonPadding}`}
            placeholder="비밀번호를 한 번 더 입력해 주세요"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
          />
          <button
            type="button"
            disabled={isPending}
            className={styles.inputActionButton}
            onClick={() => {
              setShowPasswordConfirm((current) => !current)
            }}
          >
            <span
              className={`${styles.eyeIcon} ${showPasswordConfirm ? styles.eyeIconOpen : styles.eyeIconClosed}`}
              aria-hidden="true"
            />
            <span className={styles.srOnly}>
              {showPasswordConfirm ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
            </span>
          </button>
        </div>
        {passwordMismatch ? (
          <p className={styles.inlineErrorText}>비밀번호가 일치하지 않습니다.</p>
        ) : null}
      </div>

      <section className={styles.agreementSection} aria-label="약관 동의">
        <label className={styles.agreementAllRow}>
          <input
            ref={allAgreementRef}
            type="checkbox"
            checked={allAgreed}
            disabled={isPending}
            className={styles.checkbox}
            onChange={(event) => {
              const checked = event.target.checked
              setTermsAgreed(checked)
              setPrivacyAgreed(checked)
              setMarketingAgreed(checked)
            }}
          />
          <span className={styles.agreementAllText}>전체 동의</span>
        </label>

        <div className={styles.agreementDivider} />

        <div className={styles.agreementList}>
          <div className={styles.agreementRow}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="termsAgreed"
                value="yes"
                checked={termsAgreed}
                disabled={isPending}
                className={styles.checkbox}
                onChange={(event) => {
                  setTermsAgreed(event.target.checked)
                }}
              />
              <span className={`${styles.checkText} ${hasAttemptedSubmit && !termsAgreed ? styles.checkTextError : ""}`}>
                (필수) 이용약관 동의
              </span>
            </label>
            <Link href="/terms" target="_blank" rel="noreferrer" className={styles.agreementLink}>
              보기
            </Link>
          </div>

          <div className={styles.agreementRow}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="privacyAgreed"
                value="yes"
                checked={privacyAgreed}
                disabled={isPending}
                className={styles.checkbox}
                onChange={(event) => {
                  setPrivacyAgreed(event.target.checked)
                }}
              />
              <span className={`${styles.checkText} ${hasAttemptedSubmit && !privacyAgreed ? styles.checkTextError : ""}`}>
                (필수) 개인정보 수집·이용 동의
              </span>
            </label>
            <Link href="/privacy" target="_blank" rel="noreferrer" className={styles.agreementLink}>
              보기
            </Link>
          </div>

          <div className={styles.agreementRow}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                name="marketingAgreed"
                value="yes"
                checked={marketingAgreed}
                disabled={isPending}
                className={styles.checkbox}
                onChange={(event) => {
                  setMarketingAgreed(event.target.checked)
                }}
              />
              <span className={styles.checkText}>(선택) 서비스 소식 및 마케팅 정보 수신 동의</span>
            </label>
          </div>
        </div>

        {agreementError ? <p className={styles.inlineErrorText}>{agreementError}</p> : null}
      </section>

      {state.message && state.status !== "success" ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage} role="status">
          {state.message}
        </p>
      ) : null}

      <div className={styles.submitArea}>
        <button type="submit" disabled={isSubmitDisabled} className={styles.submitButton}>
          {isPending ? "신청 중..." : "운영보드 계정 신청"}
        </button>
        {isSubmitDisabledByValidation && !isPending ? (
          <button
            type="button"
            className={styles.disabledSubmitOverlay}
            aria-label="제출 조건 확인"
            onClick={handleDisabledSubmitAttempt}
          />
        ) : null}
      </div>
    </form>
  )
}
