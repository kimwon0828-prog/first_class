"use client"

import { useEffect, useId, useRef, useState } from "react"

import {
  EMPTY_KAKAO_ADMINISTRATIVE_REGION,
  loadKakaoPostcode,
  resolveKakaoAdministrativeRegion,
  resolveKakaoPostcodeAddress,
  type KakaoAdministrativeRegion,
  type KakaoAdministrativeRegionInput
} from "@/features/maps/lib/kakao-postcode"

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
  initialRegion?: KakaoAdministrativeRegionInput | null
  disabled?: boolean
  classNames: StudioAddressFieldClassNames
  hint?: string
}

const joinClassNames = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).join(" ")

const toInitialRegion = (
  region: KakaoAdministrativeRegionInput | null | undefined
): KakaoAdministrativeRegion => ({
  sido: region?.sido?.trim() ?? "",
  sigungu: region?.sigungu?.trim() ?? "",
  bname: region?.bname?.trim() ?? "",
  sigunguCode: region?.sigunguCode?.trim() ?? "",
  bcode: region?.bcode?.trim() ?? ""
})

export function StudioAddressFields({
  initialPostalCode,
  initialAddressLine1,
  initialAddressLine2,
  initialRegion,
  disabled = false,
  classNames,
  hint = "학부모에게 노출되는 위치 정보입니다. 정확한 주소를 입력해주세요."
}: StudioAddressFieldsProps) {
  const idPrefix = useId()
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const [postalCode, setPostalCode] = useState(initialPostalCode?.trim() ?? "")
  const [addressLine1, setAddressLine1] = useState(initialAddressLine1?.trim() ?? "")
  const [addressLine2, setAddressLine2] = useState(initialAddressLine2?.trim() ?? "")
  // 행정지역 metadata 는 Kakao 선택 결과와 항상 함께 움직인다. 부분 갱신을 만들지 않는다.
  const [region, setRegion] = useState<KakaoAdministrativeRegion>(() => toInitialRegion(initialRegion))
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)

  // initialRegion 은 부모에서 매 렌더 새 객체로 올 수 있으므로 원시값으로 풀어서 의존한다.
  const initialSido = initialRegion?.sido ?? null
  const initialSigungu = initialRegion?.sigungu ?? null
  const initialBname = initialRegion?.bname ?? null
  const initialSigunguCode = initialRegion?.sigunguCode ?? null
  const initialBcode = initialRegion?.bcode ?? null

  useEffect(() => {
    setPostalCode(initialPostalCode?.trim() ?? "")
    setAddressLine1(initialAddressLine1?.trim() ?? "")
    setAddressLine2(initialAddressLine2?.trim() ?? "")
    setRegion(
      toInitialRegion({
        sido: initialSido,
        sigungu: initialSigungu,
        bname: initialBname,
        sigunguCode: initialSigunguCode,
        bcode: initialBcode
      })
    )
  }, [
    initialAddressLine1,
    initialAddressLine2,
    initialPostalCode,
    initialSido,
    initialSigungu,
    initialBname,
    initialSigunguCode,
    initialBcode
  ])

  const handleAddressSearch = async () => {
    setPostcodeError(null)
    setIsSearchingAddress(true)

    try {
      const Postcode = await loadKakaoPostcode()

      new Postcode({
        oncomplete: (data) => {
          const nextAddressLine1 = resolveKakaoPostcodeAddress(data)
          setPostalCode(data.zonecode?.trim() || "")
          setAddressLine1(nextAddressLine1)
          setAddressLine2("")
          // 주소를 다시 고르면 이전 주소의 행정지역이 남지 않도록 5개를 통째로 교체한다.
          setRegion(
            nextAddressLine1
              ? resolveKakaoAdministrativeRegion(data)
              : EMPTY_KAKAO_ADMINISTRATIVE_REGION
          )

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

      <input type="hidden" name="sido" value={region.sido} />
      <input type="hidden" name="sigungu" value={region.sigungu} />
      <input type="hidden" name="bname" value={region.bname} />
      <input type="hidden" name="sigunguCode" value={region.sigunguCode} />
      <input type="hidden" name="bcode" value={region.bcode} />

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
