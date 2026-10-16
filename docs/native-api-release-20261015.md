# 학부모 앱용 API 반영 기록 — 2026-10-15

## 배경
학부모 iOS 앱(내부 테스트 설치본 1.0.0 (3))이 쓰는 `/api/native/*` 경로를 운영에 먼저 반영했다.
반영은 검토한 작업 트리에서 CLI로 직접 배포했고, 이 문서와 함께 들어가는 커밋들이 그 배포 내용을 Git에 맞춘다.
이 커밋들이 main에 들어가기 전에 main만으로 다시 배포하면 앱용 API가 빠지므로, 이후 배포는 반드시 이 커밋을 포함한 main에서 한다.

## 변경 내용
1. 공통 로직 분리 — 웹 서버 액션에 있던 신청 취소, 체험 신청 검증, 체험 의견 제출, 알림 읽음 처리를
   `src/features/*/lib/` 로 옮겼다. 웹 액션은 쿠키 인증 클라이언트로 같은 함수를 호출하는 얇은 래퍼로 남고,
   앱용 API는 검증된 Bearer 토큰 클라이언트로 같은 함수를 호출한다. 동작 변경은 없다.
   소스 문자열을 확인하는 검증 스크립트 8개는 옮겨 간 경로와 호출 이름만 맞췄다.
2. 법률 문서 공용화 — 이용약관·개인정보처리방침·제3자 제공 동의 본문을 `src/shared/content/legal-documents.tsx` 로 옮겨
   웹 페이지와 앱용 API가 같은 본문을 쓴다. 문구·시행일은 그대로다.
3. 앱용 API — `app/api/native/catalog/[...path]`, `app/api/native/legal/[slug]`, `app/api/native/parent/[...path]` 와
   `src/features/native/server/*`. 학부모 경로는 Bearer 토큰이 없으면 `401 login_required` 를 돌려주고,
   본인 소유 데이터만 읽고 쓴다. 기존 `app/api/native/parent/push-devices` 와 그 처리기는 main 버전을 그대로 쓴다.

DB 마이그레이션, 데이터 삭제, 테스트 신청 작성, 알림 발송은 하지 않았다. 웹 하단 내비게이션과 기존 웹·Studio 경로는 바뀌지 않았다.

## 검증
- 타입 검사, lint, Next 운영 빌드 통과. 앱용 catalog·legal·parent 경로와 기존 push-devices 경로가 빌드에 포함된다.
- `scripts/verify-native-application.cjs`: 신청 14개 시나리오 통과(동의, 소유권, 정원, 알림 분리 포함).
- `scripts/verify-native-push-registration.cjs`: 10개 묶음 통과.
- 학부모 소스 검증 8개: 5개 전체 통과. 나머지 3개(class-detail-apply 1, decision 1, followup-feedback 2)의
  4개 항목은 변경 전 main에서도 똑같이 실패하는 기존 실패이며, 이번 변경으로 새로 생긴 실패는 없다.
- 운영 반영 후 공개 경로(catalog, legal) 200, 비로그인 학부모 경로 401을 확인했다.
  이는 접근 확인이며, 로그인한 학부모 계정으로 전체 기능을 검증한 것은 아니다.

## 복구 절차
- 문제가 생기면 Vercel의 Instant Rollback으로 **앱용 API가 포함된 직전 정상 운영 배포**로 되돌린다.
- 앱용 API 도입 전 배포(이 문서의 커밋을 포함하지 않는 main 배포)로는 되돌리지 않는다. 설치된 앱의 홈·수업·신청·일정·리포트·약관 화면이 모두 실패한다.
- 되돌린 뒤 공개 catalog·legal 경로 200, 비로그인 학부모 경로 401을 다시 확인한다.
