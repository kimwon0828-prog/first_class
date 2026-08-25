"use client"

import { useEffect, useId, useRef, useState } from "react"

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
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${KAKAO_POSTCODE_SCRIPT_SRC}"]`
    )

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

export const resolveKakaoPostcodeAddress = (data: KakaoPostcodeResult) =>
  data.userSelectedType === "R"
    ? data.roadAddress?.trim() || data.jibunAddress?.trim() || ""
    : data.jibunAddress?.trim() || data.roadAddress?.trim() || ""

type StudioAddressFieldClassNames = {
  field: string
  fullWidthField?: string
  label: string
  requiredMark?: string
  optionalText?: string
  input: string
  addressSearchRow: string
  addressSearchButton: string
  hint?: string
  error?: string
}

type StudioAddressFieldsProps = {
  initialPostalCode?: string | null
  initialAddressLine1?: string | null
  initialAddressLine2?: string | null
  disabled?: boolean
  classNames: StudioAddressFieldClassNames
  hint?: string
}

const joinClassNames = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).join(" ")

export function StudioAddressFields({
  initialPostalCode,
  initialAddressLine1,
  initialAddressLine2,
  disabled = false,
  classNames,
  hint = "학부모에게 노출되는 위치 정보입니다. 정확한 주소를 입력해주세요."
}: StudioAddressFieldsProps) {
  const idPrefix = useId()
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const [postalCode, setPostalCode] = useState(initialPostalCode?.trim() ?? "")
  const [addressLine1, setAddressLine1] = useState(initialAddressLine1?.trim() ?? "")
  const [addressLine2, setAddressLine2] = useState(initialAddressLine2?.trim() ?? "")
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)

  useEffect(() => {
    setPostalCode(initialPostalCode?.trim() ?? "")
    setAddressLine1(initialAddressLine1?.trim() ?? "")
    setAddressLine2(initialAddressLine2?.trim() ?? "")
  }, [initialAddressLine1, initialAddressLine2, initialPostalCode])

  const handleAddressSearch = async () => {
    setPostcodeError(null)
    setIsSearchingAddress(true)

    try {
      const Postcode = await loadKakaoPostcode()

      new Postcode({
        oncomplete: (data) => {
          setPostalCode(data.zonecode?.trim() || "")
          setAddressLine1(resolveKakaoPostcodeAddress(data))
          setAddressLine2("")

          window.setTimeout(() => {
            detailAddressRef.current?.focus()
          }, 0)
        }
      }).open()
    } catch (error) {
      console.error("[studio address postcode load failed]", error)
      setPostcodeError("주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSearchingAddress(false)
    }
  }

  return (
    <>
      <label className={classNames.field} htmlFor={`${idPrefix}-postal-code`}>
        <span className={classNames.label}>
          우편번호
          <span className={classNames.optionalText}>(선택)</span>
        </span>
        <input
          id={`${idPrefix}-postal-code`}
          name="postalCode"
          type="text"
          maxLength={20}
          disabled={disabled}
          readOnly
          className={classNames.input}
          placeholder="예: 12345"
          value={postalCode}
        />
      </label>

      <div className={joinClassNames(classNames.field, classNames.fullWidthField)}>
        <label className={classNames.label} htmlFor={`${idPrefix}-address-line-1`}>
          기본 주소
          <span className={classNames.requiredMark}>*</span>
        </label>
        <div className={classNames.addressSearchRow}>
          <input
            id={`${idPrefix}-address-line-1`}
            name="addressLine1"
            type="text"
            required
            maxLength={120}
            disabled={disabled}
            readOnly
            className={classNames.input}
            placeholder="주소 검색으로 주소를 선택해 주세요"
            value={addressLine1}
          />
          <button
            type="button"
            disabled={disabled || isSearchingAddress}
            className={classNames.addressSearchButton}
            onClick={() => {
              void handleAddressSearch()
            }}
          >
            {isSearchingAddress ? "검색 준비 중..." : "주소 검색"}
          </button>
        </div>
        {classNames.hint ? <p className={classNames.hint}>{hint}</p> : null}
        {postcodeError ? <p className={classNames.error}>{postcodeError}</p> : null}
      </div>

      <label
        className={joinClassNames(classNames.field, classNames.fullWidthField)}
        htmlFor={`${idPrefix}-address-line-2`}
      >
        <span className={classNames.label}>
          상세 주소
          <span className={classNames.optionalText}>(선택)</span>
        </span>
        <input
          ref={detailAddressRef}
          id={`${idPrefix}-address-line-2`}
          name="addressLine2"
          type="text"
          maxLength={120}
          disabled={disabled}
          className={classNames.input}
          placeholder="예: 5층 501호"
          value={addressLine2}
          onChange={(event) => setAddressLine2(event.target.value)}
        />
      </label>
    </>
  )
}
