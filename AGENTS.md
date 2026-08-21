# 첫수업 MVP 개발 규칙

## 제품 정의
첫수업은 학부모가 아이에게 맞는 체험수업을 탐색하고 신청할 수 있고,
학원/선생님이 체험 신청을 확인하고 일정을 확정/관리하며 등록 전 전환 흐름까지 운영할 수 있는 플랫폼이다.

## 기술 기준
- 웹앱은 Next.js 기반으로 개발한다.
- 런타임은 Node.js 기준으로 사용한다.
- 인증, DB, 권한 관리는 Supabase를 사용한다.
- UI 디자인의 기준은 Figma다.
- 현재 프로젝트 루트 기준으로 작업한다.
- 이미 package.json과 src가 있으면 새로운 nested app(frontend 등)를 만들지 않는다.

## 사용자 역할
- parent: 학부모
- teacher: 선생님(운영 주체)

## 제품 원칙
1. 학부모는 로그인 없이 수업 리스트와 상세를 볼 수 있다.
2. 체험 신청, 내 신청내역 확인은 로그인 후 가능하다.
3. teacher 계정은 공개 회원가입이 아니라 초대/수동 생성으로 시작한다.
4. 학부모 화면은 mobile-first로 구현한다.
5. studio(teacher) 화면은 desktop-first로 구현한다.
6. MVP 프로그램 유형은 `trial_class`(체험수업), `level_test`(레벨테스트) 2개만 지원한다.
7. 입학고시는 MVP 범위에서 제외하고 후순위로 미룬다.
8. 상태값은 당장 크게 늘리지 않고 후속 phase에서 attendance/result/consultation/registration 축으로 분리한다.
9. 과한 기능을 한 번에 만들지 않는다.

## 개발 원칙
- 항상 먼저 계획을 짧게 제시한 뒤 구현한다.
- docs 폴더의 문서를 먼저 읽고 그 기준으로 작업한다.
- 새로운 라이브러리를 추가할 때는 이유를 설명한다.
- UI는 Figma가 나오기 전까지 과한 스타일링보다 구조와 상태 중심으로 만든다.
- 로딩, 빈 상태, 에러 상태를 반드시 고려한다.
- 더미 데이터로 먼저 연결하고, 이후 실제 Supabase 데이터로 연결한다.
- 큰 변경 전에는 어떤 파일을 바꿀지 먼저 알려준다.

## 지속 작업 안전 규칙
- 변경 전에는 반드시 실제 route, caller, server action, adapter 호출부를 먼저 확인한다.
- 신청 상태 기본 계약 `new -> reviewing -> confirmed -> completed`는 유지한다. 상태 이름/의미를 임의로 바꾸거나 별도 상태 체계로 재설계하지 않는다.
- 신청 상태 관련 작업에서는 항상 `trial_applications`, `application_logs`, 일정 데이터, SMS/알림톡 로그, 등록 전환 데이터를 함께 확인한다.
- 체험 완료 이후 전환 흐름에서는 `trial_applications.completed_at`, `last_activity_at`, `next_contact_at`를 핵심 원천 데이터로 취급한다. `next_contact_at`은 nullable이며 임의로 필수화하지 않는다.
- 상담 파이프라인은 신청 관리와 목적이 다르다. 신청일 기준 월/기간 필터 때문에 상담 중 리드가 사라지는 구조로 바꾸지 않는다.
- 전화 버튼/전화 액션은 `전화 시도`를 의미한다. 버튼 클릭만으로 상담 완료/통화 성공으로 간주하지 않는다.
- SMS/알림톡은 safe wrapper 패턴을 유지한다. 알림 실패 때문에 신청 생성, 담당자 변경, 일정 확정, 체험 완료, 상담 기록, 등록 전환 같은 핵심 작업이 실패하면 안 된다.
- 일정 occurrence 및 시간 비교는 항상 `Asia/Seoul` 기준 해석을 먼저 확인한다. UTC timestamp와 `class_schedule.start_time` 문자열을 직접 비교하지 않는다.
- 데이터 접근 계층을 바꾸기 전에는 `src/shared/lib/db/adapter.ts`, `src/shared/lib/db/supabase-adapter.ts`, `src/shared/lib/db/mock-adapter.ts`를 함께 확인한다. adapter interface를 바꾸면 mock 구현과 호출부까지 같이 맞춘다.
- DB schema 변경, migration 생성/수정, `db push`류 명령은 사용자 승인 없이 진행하지 않는다.
- 기존 route는 리팩터링, naming consistency, 정리 목적만으로 rename/remove 하지 않는다. 필요 시 먼저 제안하고 승인 후 진행한다.
- legacy처럼 보이는 코드도 import/caller/route/UI/adapter 연결을 확인하기 전에는 삭제·통합하지 않는다.
- 기능 작업 후에는 최소 `lint`, `typecheck` 필요 여부를 판단하고, 실행하지 못했으면 이유를 보고한다.
- `git add`, `commit`, `push`는 사용자 승인 없이 진행하지 않는다.

## 완료 기준
- 페이지가 실행된다.
- 핵심 흐름이 이어진다.
- 타입 에러와 lint 에러가 없다.
- auth와 DB 연결 포인트가 분리되어 있다.
