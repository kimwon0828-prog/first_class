import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * 체험 신청비 확인 여부(classes.trial_price_confirmed_at).
 *
 * trial_price 는 not null default 0 이라 "미입력"과 "실제 무료"가 같은 0 이다.
 * 학원이 Studio 에서 무료·유료를 직접 골라 저장한 때만 확인 시각이 생기고, 기존 행은 추정해서 채우지 않는다.
 *
 * 일관성은 DB 가 지킨다(migration 20261016120000 의 트리거):
 *   - 확인은 가격과 같은 저장 문장에 trial_price_confirmed_at 을 함께 보낼 때만 기록되고, 시각은 DB 가 now() 로 정한다.
 *   - 어떤 경로든 가격이 바뀌었는데 같은 문장에서 확인하지 않았으면 확인 기록을 지운다.
 *   - 제목·사진 등만 바꾼 저장은 확인 기록을 그대로 둔다.
 *
 * 값의 의미:
 *   true  — 학원이 확인한 가격
 *   false — 확인 기록 없음(0원이면 학부모에게 "무료"로 보이지 않는다)
 *   null  — 확인 컬럼이 아직 없는 DB(migration 미적용). 호출부는 기존 표시를 유지한다.
 */
export type TrialPriceConfirmations = ReadonlyMap<string, boolean> | null

export const TRIAL_PRICE_CONFIRMATION_COLUMN = "trial_price_confirmed_at"

type DbError = { code?: string; message?: string } | null | undefined
/**
 * 확인 컬럼 자체가 없다는 오류에만 참. migration 미적용 DB 를 알아보는 데만 쓴다.
 *   42703    + "column [classes.]trial_price_confirmed_at does not exist"  (select)
 *   PGRST204 + "Could not find the 'trial_price_confirmed_at' column ..."  (insert/update payload)
 * 권한·통신·다른 컬럼 누락·컬럼 이름만 들어 있는 일반 오류는 해당하지 않는다.
 */
export const isMissingTrialPriceConfirmationColumn = (error: DbError) => {
  if (!error || typeof error.message !== "string") return false
  if (error.code === "42703") return /\bcolumn (?:"?classes"?\.)?"?trial_price_confirmed_at"? does not exist\b/.test(error.message)
  if (error.code === "PGRST204") return /Could not find the 'trial_price_confirmed_at' column of 'classes'/.test(error.message)
  return false
}

/** migration 미적용 DB 의 save_studio_class_operating_rule 은 모르는 키를 'invalid_class_field' 로 거절한다. */
export const isTrialPriceConfirmationFieldRejected = (error: DbError) =>
  Boolean(error) && typeof error!.message === "string" && error!.message.trim() === "invalid_class_field"

/**
 * 확인을 가격과 같은 저장 문장에 싣는다. 확인 키를 실은 첫 시도가 "컬럼/키가 없는 DB"로만 실패하면
 * 키 없이 한 번 더 저장한다(첫 시도는 실패로 끝나 아무것도 쓰이지 않았다). 그 밖의 오류와 결과는 그대로 돌려준다.
 */
export async function saveWithTrialPriceConfirmation<T extends { error: DbError }>(
  confirm: boolean,
  attempt: (confirmationField: Record<string, string>) => PromiseLike<T>
): Promise<T> {
  if (!confirm) return attempt({})
  const first = await attempt({ [TRIAL_PRICE_CONFIRMATION_COLUMN]: new Date().toISOString() })
  return isMissingTrialPriceConfirmationColumn(first.error) || isTrialPriceConfirmationFieldRejected(first.error)
    ? attempt({})
    : first
}

export async function loadTrialPriceConfirmations(client: SupabaseClient, classIds: readonly string[]): Promise<TrialPriceConfirmations> {
  const ids = [...new Set(classIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data, error } = await client.from("classes").select("id, trial_price_confirmed_at").in("id", ids)
  if (isMissingTrialPriceConfirmationColumn(error)) return null
  // 그 밖의 읽기 실패는 "확인 안 됨"으로 둔다 — 확인되지 않은 0원을 무료로 보여 주는 쪽으로 실패하지 않는다.
  if (error) return new Map()
  return new Map(((data ?? []) as { id: string; trial_price_confirmed_at: string | null }[]).map(row => [row.id, Boolean(row.trial_price_confirmed_at)]))
}

export const trialPriceConfirmedOf = (confirmations: TrialPriceConfirmations, classId: string): boolean | null =>
  confirmations === null ? null : confirmations.get(classId) === true

export const withTrialPriceConfirmation = <T extends { id: string }>(items: T[], confirmations: TrialPriceConfirmations) =>
  items.map(item => ({ ...item, trialPriceConfirmed: trialPriceConfirmedOf(confirmations, item.id) }))

/** 조회 결과 행의 확인 값. 확인 컬럼을 고르지 못한(미적용 DB) 조회는 undefined → null. */
export const trialPriceConfirmedFromRow = (row: { trial_price_confirmed_at?: string | null }): boolean | null =>
  row.trial_price_confirmed_at === undefined ? null : Boolean(row.trial_price_confirmed_at)
