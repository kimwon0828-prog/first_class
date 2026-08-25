const KAKAO_POSTCODE_SCRIPT_SRC =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"

export type KakaoPostcodeResult = {
  zonecode?: string
  roadAddress?: string
  jibunAddress?: string
  userSelectedType?: "R" | "J"
  sido?: string
  sigungu?: string
  sigunguCode?: string
  bname?: string
  bname1?: string
  bname2?: string
  bcode?: string
}

// 저장 계약은 아래 5개뿐이다. bname1/bname2 는 타입에만 존재하고 저장하지 않는다.
export type KakaoAdministrativeRegion = {
  sido: string
  sigungu: string
  bname: string
  sigunguCode: string
  bcode: string
}

// DB 에서 읽어온 metadata 는 NULL 일 수 있다.
export type KakaoAdministrativeRegionInput = {
  [K in keyof KakaoAdministrativeRegion]?: string | null
}

export const EMPTY_KAKAO_ADMINISTRATIVE_REGION: KakaoAdministrativeRegion = {
  sido: "",
  sigungu: "",
  bname: "",
  sigunguCode: "",
  bcode: ""
}

export type KakaoPostcodeInstance = {
  open: () => void
}

export type KakaoPostcodeConstructor = new (options: {
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

export const loadKakaoPostcode = () => {
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

// Kakao 는 지역에 따라 일부 필드를 빈 문자열로 준다. 빈 값은 그대로 빈 문자열로 둔다.
export const resolveKakaoAdministrativeRegion = (
  data: KakaoPostcodeResult
): KakaoAdministrativeRegion => ({
  sido: data.sido?.trim() ?? "",
  sigungu: data.sigungu?.trim() ?? "",
  bname: data.bname?.trim() ?? "",
  sigunguCode: data.sigunguCode?.trim() ?? "",
  bcode: data.bcode?.trim() ?? ""
})
