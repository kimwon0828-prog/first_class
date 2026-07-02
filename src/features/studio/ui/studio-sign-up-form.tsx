"use client"

import Link from "next/link"
import { useActionState, useRef, useState } from "react"

import { academyAreaOptions } from "@/shared/config/academy-areas"
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
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)

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
    <form action={formAction} className={styles.form} encType="multipart/form-data">
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
        <span className={styles.label}>학원명</span>
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
        <span className={styles.label}>학원가</span>
        <select name="academyArea" required disabled={isPending} className={styles.input} defaultValue="">
          <option value="" disabled>
            학원가를 선택해 주세요
          </option>
          {academyAreaOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>지점명 (선택)</span>
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
        <span className={styles.label}>대표자명</span>
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
        <span className={styles.label}>사업자등록번호</span>
        <input
          name="businessRegistrationNumber"
          type="text"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 123-45-67890"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학원 대표 전화번호</span>
        <input
          name="academyPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 02-1234-5678"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>담당자 전화번호</span>
        <input
          name="contactPhone"
          type="tel"
          required
          maxLength={20}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 010-1234-5678"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>우편번호 (선택)</span>
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
        <span className={styles.label}>기본 주소</span>
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
        <span className={styles.label}>상세 주소 (선택)</span>
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

      <label className={styles.field}>
        <span className={styles.label}>사업자등록증 이미지</span>
        <input
          name="businessRegistrationFile"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          className={`${styles.input} ${styles.fileInput}`}
        />
        <p className={styles.fieldHint}>JPG, PNG, WEBP 파일만 업로드할 수 있으며 최대 5MB까지 지원합니다.</p>
      </label>

      <p className={styles.bottomHint}>입력한 주소와 연락처는 가입 심사 및 학원 공식 정보 검토에 사용됩니다.</p>

      <label className={styles.field}>
        <span className={styles.label}>이메일 (아이디)</span>
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
        />
      </label>

      {state.message && state.status !== "success" ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage} role="status">
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "신청 중..." : "운영보드 계정 신청"}
      </button>
    </form>
  )
}
