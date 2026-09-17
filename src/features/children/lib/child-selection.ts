import type { ChildProfile } from "@/shared/lib/db/adapter"

/**
 * "지금 어느 아이를 보고 있는가" 의 단일 계약.
 *
 * ⚠️ 새 저장 방식을 만들지 않는다. /record 가 이미 쓰고 있는 ?child= 를 그대로 쓴다.
 *    cookie · localStorage · DB column 을 새로 만들면 같은 질문에 답하는 자리가
 *    두 곳이 되고, 어느 쪽이 맞는지 알 수 없게 된다.
 *
 * ⚠️ 선택을 저장하려고 Production write 를 만들지 않는다. 주소가 곧 상태다.
 */
export const CHILD_QUERY_KEY = "child"

/**
 * 화면이 아는 아이 정보.
 *
 * ⚠️ ChildProfile 을 통째로 client 로 내려보내지 않는다. 메모 · 목표 · 수준은
 *    선택 UI 가 알 필요가 없는 값이고, 알 이유도 없다.
 */
export type ChildSelectorOption = {
  id: string
  name: string
  grade: string
}

export const toChildSelectorOptions = (
  children: readonly ChildProfile[]
): ChildSelectorOption[] =>
  children.map((child) => ({
    id: child.id,
    name: child.name,
    grade: child.grade
  }))

/**
 * 주소에 적힌 아이가 실제로 내 아이일 때만 선택으로 인정한다.
 *
 * /record 와 같은 규칙이다 — 남의 id 를 주소에 넣어도 목록에 없으므로
 * 아무것도 선택되지 않은 것(= 전체)으로 떨어진다.
 */
export const resolveSelectedChildId = (
  requested: string | null | undefined,
  children: readonly { id: string }[]
): string | null => {
  const value = (requested ?? "").trim()
  if (!value) {
    return null
  }

  return children.some((child) => child.id === value) ? value : null
}

/** "김사랑 · 초6". 학년이 비어 있으면 이름만 쓴다. 없는 값을 지어내지 않는다. */
export const formatChildOptionLabel = (child: ChildSelectorOption): string => {
  const grade = child.grade.trim()
  return grade ? `${child.name} · ${grade}` : child.name
}

/**
 * selector 버튼에 적히는 글.
 *
 *   특정 아이   → "김사랑 · 초6"
 *   전체 · 1명  → "초6 김사랑"   (아이가 하나면 "전체" 라는 말이 필요 없다)
 *   전체 · 2명+ → "우리 아이 2명"
 *   0명         → null           (selector 자체를 띄우지 않는다)
 */
export const formatChildTriggerLabel = (
  children: readonly ChildSelectorOption[],
  selectedChildId: string | null
): string | null => {
  if (children.length === 0) {
    return null
  }

  const selected = selectedChildId
    ? children.find((child) => child.id === selectedChildId) ?? null
    : null
  if (selected) {
    return formatChildOptionLabel(selected)
  }

  if (children.length === 1) {
    const [child] = children
    const grade = child.grade.trim()
    return grade ? `${grade} ${child.name}` : child.name
  }

  return `우리 아이 ${children.length}명`
}

/** 아이가 둘 이상일 때만 "전체" 라는 선택지가 의미를 가진다. */
export const shouldOfferAllChildrenOption = (
  children: readonly ChildSelectorOption[]
): boolean => children.length > 1

/**
 * 선택된 아이의 것만 남긴다.
 *
 * ⚠️ childId 가 없는 legacy 신청(엑셀 이관분 등)은 특정 아이를 고른 순간 빠진다.
 *    어느 아이 것인지 모르는 것을 "이 아이 것" 이라고 말할 수는 없다.
 *    전체를 보고 있을 때는 지금까지처럼 전부 보인다.
 */
export const selectChildScopedItems = <T extends { childId: string | null }>(
  items: readonly T[],
  selectedChildId: string | null
): T[] => {
  if (!selectedChildId) {
    return [...items]
  }

  return items.filter((item) => item.childId === selectedChildId)
}
