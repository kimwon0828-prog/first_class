"use client"

import Image from "next/image"
import Link from "next/link"
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react"

import {
  studioSignUpAction,
  type StudioSignUpActionState
} from "@/features/studio/actions/studio-sign-up"
import {
  studioResubmitSignUpAction,
  type StudioResubmitSignUpActionState
} from "@/features/studio/actions/studio-resubmit-sign-up"
import type { KakaoAdministrativeRegionInput } from "@/features/maps/lib/kakao-postcode"
import { StudioAddressFields } from "@/features/studio/ui/studio-address-fields"
import styles from "@/features/studio/ui/studio-sign-up-form.module.css"

type SharedActionState = StudioSignUpActionState | StudioResubmitSignUpActionState

const initialState: SharedActionState = {
  status: "idle",
  message: ""
}

const MAX_BUSINESS_REGISTRATION_FILE_SIZE = 5 * 1024 * 1024
const BUSINESS_REGISTRATION_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp"
const ALLOWED_BUSINESS_REGISTRATION_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
])

type StudioSignUpFormProps = {
  mode?: "signup" | "resubmit"
  initialValues?: {
    organizationName?: string | null
    branchName?: string | null
    representativeName?: string | null
    businessRegistrationNumber?: string | null
    academyPhone?: string | null
    contactPhone?: string | null
    postalCode?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    region?: KakaoAdministrativeRegionInput | null
    businessRegistrationFilePath?: string | null
  }
}

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

export const StudioSignUpForm = ({
  mode = "signup",
  initialValues
}: StudioSignUpFormProps) => {
  const action = mode === "resubmit" ? studioResubmitSignUpAction : studioSignUpAction
  const [state, formAction, isPending] = useActionState(action, initialState)
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
  const [keepExistingBusinessRegistrationFile, setKeepExistingBusinessRegistrationFile] = useState(
    Boolean(initialValues?.businessRegistrationFilePath)
  )
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  const businessRegistrationFileRef = useRef<HTMLInputElement | null>(null)
  const allAgreementRef = useRef<HTMLInputElement | null>(null)
  const formContentRef = useRef<HTMLDivElement | null>(null)
  const successActionButtonRef = useRef<HTMLAnchorElement | null>(null)

  const isResubmitMode = mode === "resubmit"
  const isSuccess = state.status === "success"
  const formLocked = isPending || isSuccess
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
  const requiresNewBusinessRegistrationFile =
    isResubmitMode && !keepExistingBusinessRegistrationFile && !selectedFile
  const isSubmitDisabledByValidation =
    (!isResubmitMode && requiredAgreementMissing) ||
    (!isResubmitMode && passwordMismatch) ||
    requiresNewBusinessRegistrationFile
  const isSubmitDisabled = formLocked || isSubmitDisabledByValidation

  useEffect(() => {
    if (!isResubmitMode) {
      return
    }

    setBusinessRegistrationNumber(initialValues?.businessRegistrationNumber?.trim() ?? "")
  }, [
    initialValues?.businessRegistrationNumber,
    isResubmitMode
  ])

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
    const element = formContentRef.current
    if (!element) {
      return
    }

    if (isSuccess) {
      element.setAttribute("inert", "")
      element.setAttribute("aria-hidden", "true")
      return
    }

    element.removeAttribute("inert")
    element.removeAttribute("aria-hidden")
  }, [isSuccess])

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

  useEffect(() => {
    if (!isSuccess) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusTimer = window.setTimeout(() => {
      successActionButtonRef.current?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (event.key === "Tab") {
        event.preventDefault()
        successActionButtonRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.body.style.overflow = originalOverflow
      window.clearTimeout(focusTimer)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isSuccess])

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
    if (isResubmitMode) {
      setKeepExistingBusinessRegistrationFile(false)
    }

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
    setKeepExistingBusinessRegistrationFile(false)
    setFileError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setHasAttemptedSubmit(true)

    let hasCustomError = false

    if (!isResubmitMode && !handleAgreementValidation()) {
      hasCustomError = true
    }

    if (!isBusinessRegistrationNumberValid(businessRegistrationNumber)) {
      hasCustomError = true
    }

    if (!selectedFile && !keepExistingBusinessRegistrationFile) {
      setFileError("사업자등록증 파일을 첨부해 주세요.")
      hasCustomError = true
    }

    if (!isResubmitMode && !isPasswordValid(password)) {
      hasCustomError = true
    }

    if (!isResubmitMode && password !== passwordConfirm) {
      hasCustomError = true
    }

    if (hasCustomError) {
      event.preventDefault()
    }
  }

  return (
    <form action={formAction} className={styles.form} onSubmit={handleSubmit}>
      <div ref={formContentRef} className={styles.formContent}>
        <label className={styles.field}>
          <FieldLabel text="학원명" required />
          <input
            name="organizationName"
            type="text"
            required
            minLength={2}
            maxLength={50}
            disabled={formLocked}
            className={styles.input}
            placeholder="예: 첫수업 강남학원"
            defaultValue={initialValues?.organizationName ?? ""}
          />
        </label>

        <label className={styles.field}>
          <FieldLabel text="지점명" optional />
          <input
            name="branchName"
            type="text"
            maxLength={30}
            disabled={formLocked}
            className={styles.input}
            placeholder="예: 강남점"
            defaultValue={initialValues?.branchName ?? ""}
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
            disabled={formLocked}
            className={styles.input}
            placeholder="예: 홍길동"
            defaultValue={initialValues?.representativeName ?? ""}
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
            disabled={formLocked}
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
            disabled={formLocked}
            className={styles.input}
            placeholder="예: 02-1234-5678"
            defaultValue={initialValues?.academyPhone ?? ""}
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
            disabled={formLocked}
            className={styles.input}
            placeholder="예: 010-1234-5678"
            defaultValue={initialValues?.contactPhone ?? ""}
          />
          <p className={styles.fieldHint}>
            체험수업 신청 알림 문자를 받으실 번호입니다. 실제로 확인 가능한 번호를 입력해 주세요.
          </p>
        </label>

        <StudioAddressFields
          initialPostalCode={initialValues?.postalCode}
          initialAddressLine1={initialValues?.addressLine1}
          initialAddressLine2={initialValues?.addressLine2}
          initialRegion={initialValues?.region}
          disabled={formLocked}
          classNames={{
            field: styles.field,
            label: styles.label,
            requiredMark: styles.requiredMark,
            optionalText: styles.optionalText,
            input: styles.input,
            addressSearchRow: styles.addressSearchRow,
            addressSearchButton: styles.addressSearchButton,
            hint: styles.fieldHint,
            error: styles.errorMessage
          }}
        />

        <div className={styles.field}>
          <FieldLabel text="사업자등록증" required error={Boolean(fileError)} />
          {isResubmitMode ? (
            <input
              type="hidden"
              name="keepExistingBusinessRegistrationFile"
              value={keepExistingBusinessRegistrationFile ? "yes" : "no"}
            />
          ) : null}
          <input
            ref={businessRegistrationFileRef}
            name="businessRegistrationFile"
            type="file"
            required={!isResubmitMode}
            accept={BUSINESS_REGISTRATION_ACCEPT}
            disabled={formLocked}
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
              ) : keepExistingBusinessRegistrationFile && initialValues?.businessRegistrationFilePath ? (
                <div className={styles.uploadDocumentIcon} aria-hidden="true">
                  기존
                </div>
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
              ) : keepExistingBusinessRegistrationFile && initialValues?.businessRegistrationFilePath ? (
                <>
                  <p className={styles.uploadFileName}>
                    {initialValues.businessRegistrationFilePath.split("/").pop() ?? "기존 파일"}
                  </p>
                  <p className={styles.uploadFileMeta}>기존 사업자등록증 파일을 유지합니다.</p>
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
                disabled={formLocked}
                className={styles.uploadActionButton}
                onClick={() => {
                  businessRegistrationFileRef.current?.click()
                }}
              >
                {selectedFile || keepExistingBusinessRegistrationFile ? "다시 업로드" : "파일 선택"}
              </button>
              {selectedFile || keepExistingBusinessRegistrationFile ? (
                <button
                  type="button"
                  disabled={formLocked}
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

        {!isResubmitMode ? (
          <label className={styles.field}>
            <FieldLabel text="이메일 (아이디)" required />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              disabled={formLocked}
              className={styles.input}
            />
          </label>
        ) : null}

        {!isResubmitMode ? (
          <>
            <div className={styles.field}>
              <FieldLabel text="비밀번호" required error={Boolean(passwordRuleError)} />
              <div className={`${styles.inputWithAction} ${passwordRuleError ? styles.inputWithActionError : ""}`}>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={formLocked}
                  className={`${styles.input} ${styles.inputWithButtonPadding}`}
                  placeholder="영문, 숫자 포함 8자 이상"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  disabled={formLocked}
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
                  disabled={formLocked}
                  className={`${styles.input} ${styles.inputWithButtonPadding}`}
                  placeholder="비밀번호를 한 번 더 입력해 주세요"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
                <button
                  type="button"
                  disabled={formLocked}
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
          </>
        ) : null}

        {!isResubmitMode ? (
          <section className={styles.agreementSection} aria-label="약관 동의">
            <label className={styles.agreementAllRow}>
              <input
                ref={allAgreementRef}
                type="checkbox"
                checked={allAgreed}
                disabled={formLocked}
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
                    disabled={formLocked}
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
                    disabled={formLocked}
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
                    disabled={formLocked}
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
        ) : null}

        {state.message && state.status !== "success" ? (
          <div className={state.status === "error" ? styles.errorMessage : styles.infoMessage} role="status">
            <p className={styles.messageText}>{state.message}</p>
            {"actionLinkHref" in state && state.actionLinkHref && state.actionLinkLabel ? (
              <Link href={state.actionLinkHref} className={styles.messageLink}>
                {state.actionLinkLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className={styles.submitArea}>
          <button type="submit" disabled={isSubmitDisabled} className={styles.submitButton}>
            {isSuccess
              ? isResubmitMode
                ? "재신청 접수 완료"
                : "신청 접수 완료"
              : isPending
                ? isResubmitMode
                  ? "재신청 중..."
                  : "신청 중..."
                : isResubmitMode
                  ? "수정 후 재신청"
                  : "운영보드 계정 신청"}
          </button>
          {isSubmitDisabledByValidation && !formLocked ? (
            <button
              type="button"
              className={styles.disabledSubmitOverlay}
              aria-label="제출 조건 확인"
              onClick={handleDisabledSubmitAttempt}
            />
          ) : null}
        </div>
      </div>

      {isSuccess ? (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-sign-up-success-title"
            aria-describedby="studio-sign-up-success-description"
          >
            <div className={styles.modalCheckIcon} aria-hidden="true" />
            <h2 id="studio-sign-up-success-title" className={styles.modalTitle}>
              학원 계정 신청이 접수되었습니다
            </h2>
            <p id="studio-sign-up-success-description" className={styles.modalDescription}>
              운영팀이 학원 정보를 확인한 뒤
              <br />
              영업일 기준 1일 이내에 담당자 전화번호로 연락드립니다.
            </p>
            <Link
              ref={successActionButtonRef}
              href="/studio/sign-in"
              className={styles.modalActionButton}
            >
              {isResubmitMode ? "운영보드 로그인으로 이동" : "운영보드 로그인으로 이동"}
            </Link>
          </div>
        </div>
      ) : null}
    </form>
  )
}
