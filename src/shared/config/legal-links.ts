// 정책 문서 링크의 단일 출처.
//
// 문서 본문은 app/(legal)/* 가 canonical 이다. 여기서는 그 route 를 가리키기만 한다.
// Studio 안에 정책 내용을 복사해 두지 않는다 — 내용이 갈라지면 어느 쪽이 맞는지 알 수 없다.
//
// ⚠️ 실제로 존재하는 route 만 넣는다. 없는 문서를 위해 임시 href 를 만들지 않는다.

export type LegalLink = {
  href: string
  label: string
}

export const LEGAL_LINKS: LegalLink[] = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/third-party-consent", label: "개인정보 제3자 제공 동의" }
]
