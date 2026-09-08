// Toss customerKey.
//
// 공식 안내: "각 구매자에게 고유한 무작위 값을 발급해주세요. 자동 증가하는 숫자 또는
// 이메일·전화번호·사용자 아이디와 같이 유추가 가능한 값은 안전하지 않습니다."
//
// 그래서 organization UUID 를 그대로 쓰지 않는다. 우리 조직 id 는 URL 과 로그에
// 드러나는 값이라 "유추 가능" 에 해당한다. 별도 난수를 발급해
// organization_billing_customers.provider_customer_key 에 저장하고, 그 매핑으로만
// 조직을 찾는다. client 가 customerKey 를 고르는 경로는 두지 않는다.

import { randomBytes } from "node:crypto"

import {
  TOSS_CUSTOMER_KEY_MAX_LENGTH,
  TOSS_CUSTOMER_KEY_MIN_LENGTH
} from "@/features/billing/lib/toss/contract"

const PREFIX = "fs-"

/** 허용 문자만 쓴다(영문/숫자/-). 접두사의 `-` 로 특수문자 조건도 만족한다. */
export const generateTossCustomerKey = (): string =>
  `${PREFIX}${randomBytes(16).toString("hex")}`

export const isValidTossCustomerKey = (value: string | null | undefined): boolean => {
  const key = value ?? ""
  return (
    key.length >= TOSS_CUSTOMER_KEY_MIN_LENGTH &&
    key.length <= TOSS_CUSTOMER_KEY_MAX_LENGTH &&
    /^fs-[0-9a-f]{32}$/.test(key)
  )
}
