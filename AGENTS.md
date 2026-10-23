# 첫수업 MVP 개발 규칙

## 제품 정의
첫수업은 학부모가 아이에게 맞는 체험수업을 탐색하고 신청할 수 있고,
학원이 체험 신청을 확인하고 일정을 확정/관리하며 등록 전 전환 흐름까지 운영할 수 있는 플랫폼이다.

## 기술 기준
- 웹앱은 Next.js 기반으로 개발한다.
- 런타임은 Node.js 기준으로 사용한다.
- 인증, DB, 권한 관리는 Supabase를 사용한다.
- UI 디자인의 기준은 Figma다.
- 현재 프로젝트 루트 기준으로 작업한다.
- 이미 package.json과 src가 있으면 새로운 nested app(frontend 등)를 만들지 않는다.

## 사용자 역할
로그인 계정의 역할은 `profiles.role` 기준 세 가지다(DB CHECK: `parent | academy | admin`).
- parent: 학부모. 공개 회원가입(이메일·카카오·Apple).
- academy: 학원 로그인 계정(운영 주체). 운영자 승인 시 1개 생성된다(같은 학원에 계정을 추가·초대하는 기능은 없다).
- admin: 운영자. `/admin/*`를 쓰고, `organization_id`가 있으면 Studio에도 들어갈 수 있다.

선생님(`teachers`)은 로그인 계정이 아니다. 학원이 Studio에서 등록하는 **명부**(이름·연락처·문자 수신)이고,
수업 담당과 신청 담당으로 지정하는 데 쓴다(`teachers.profile_id`는 null).

용어 주의:
- 앱 코드에 `operator`가 남아 있다(`normalizeProfileRole`이 admin으로 접음). DB CHECK상 operator 행은 만들 수 없다.
- RLS의 `'teacher'`는 "학원 로그인 계정"을 뜻한다. `app.current_role()`이 academy/admin을 `'teacher'`로 접는다.
- 서버 액션 로그 문구("teacher가 …")와 함수 이름(`requireTeacherStudioAccess`, `teacher_signup_requests`)의 teacher도 같은 뜻이다.

## 제품 원칙
1. 학부모는 로그인 없이 수업 리스트와 상세를 볼 수 있다.
2. 체험 신청, 내 신청내역 확인은 로그인 후 가능하다.
3. 학원 계정은 공개 가입 신청(`/studio/sign-up`) → 운영자 승인(`/admin/academy-approvals`)으로 만든다.
   승인 시 organization과 academy 프로필이 생성된다. 초대 기능은 없다. 선생님은 로그인하지 않는다.
4. 학부모 화면은 mobile-first로 구현한다.
5. studio(학원) 화면은 desktop-first로 구현한다.
6. MVP 프로그램 유형은 `trial_class`(체험수업), `level_test`(레벨테스트) 2개만 지원한다.
7. 입학고시는 MVP 범위에서 제외하고 후순위로 미룬다.
8. 상태값은 당장 크게 늘리지 않고 후속 phase에서 attendance/result/consultation/registration 축으로 분리한다.
9. 과한 기능을 한 번에 만들지 않는다.
10. 학부모에게 공개되는 학원·수업은 현재 서울 노원구만이다(`src/features/location/lib/parent-launch-region.ts`). 학원가(academy_area) 개념은 삭제됐다.

## 요금제 정책 (Free / Standard)
경계는 한 문장이다. **Free는 기록하고 운영하고 학부모와 공유한다. Standard는 기록을 분석한다.**

Free에서 가능:
- 체험 결과 작성
- 상담 작성/수정, 상담 재오픈 — ⚠️ 현재 UI 미제공. server action과 entitlement flag(`canWriteConsultations`, `canReopenConsultation`)만 남아 있고 화면에서는 이전 상담 기록 조회만 된다.
- 등록 결과 기록
- 리포트 내부 미리보기
- 학부모 리포트 보내기(신규 발행) — 2차-1(2026-10)부터 무료다. 학부모가 리포트를 보고 등록을 결정하기 때문이다.
- Excel 예약 가져오기
- 선생님 등록 — 인원 제한 없음(Free · Standard 모두)

Standard 전용:
- 등록 전환 분석
- 미등록 사유 분석
- 등록 전환 인포그래픽
- 학부모 리포트 새 버전 재발행 — ⚠️ 현재 불가. DB 트리거 `report_send_once`가 신청당 1회 발행만 허용하고(superseded 전환도 막음) 화면도 "보낸 뒤 읽기 전용"이다.

가격 · 체험:
- Standard는 월 39,000원(부가세 포함 총액, 별도 표기 없음). 금액의 주인은 `src/features/billing/lib/plan-catalog.ts` 하나다.
- 새로 승인된 학원은 승인과 같은 transaction에서 Standard 90일 무료 체험이 시작된다(카드 없음, `approve_teacher_signup_request`).
  - 체험 종료 시각은 (승인일 KST + 90일) 00:00 KST다. 화면 · 문자의 "M월 D일까지 / M월 D일에 끝나요"의 D는 그 전날(마지막 체험일)이다.
  - 사업자등록번호(숫자만)당 1회. 기존 승인 학원 · 수동 trialing(PoC) · 데모 override는 손대지 않는다(`trial_origin`이 null).
- 체험 중 카드 등록은 **종료 30일 전부터만** 열린다(전자상거래법 무료→유료 전환 동의). 등록 화면에 결제일 · 금액 · 자동결제 · 해지 방법을 적고 동의 체크를 받는다.
  등록은 빌링키만 발급하고 결제하지 않는다. 마지막 체험일에 첫 39,000원을 결제하고, 새 기간은 종료 시각부터 시작한다.
- 카드를 등록하지 않았거나 체험 중 해지했으면 종료 시각에 무료 플랜이 된다. 첫 결제가 실패하면 기존 갱신과 같이 3일 유예 후 무료다.
- 알림: 종료 30일 · 7일 · 1일 전 문자와 종료 뒤 결과 문자(무료 전환 / 결제 성공 / 결제 실패). Studio에는 종료 14일 전부터 상단 안내.

이미 발행된 리포트:
- downgrade 이후에도 학부모 열람을 유지한다. 발행본은 발행 시점 snapshot이고, Parent RLS는 요금제를 보지 않는다.
- 철회는 요금제와 무관하게 할 수 있다.

운영 규칙:
- 요금제 판정의 단일 소스는 `src/features/billing/lib/entitlements.ts`다. 화면과 action은 요금제 이름을 비교하지 않고 entitlement flag만 본다.
- 유료 mutation은 UI에서 버튼을 감추는 것으로 끝내지 않는다. server action에서 `requireStudioEntitlement`로 막는다(fail closed).
- 구현체가 없는 기능(고급 대시보드, 데이터 export, AI 상담 도구)은 billing 화면에 판매 기능으로 표시하지 않는다.
- Marketplace 입점은 Free / Standard 공통이다. **요금제에 따른 우선 노출은 없다.**
  학부모가 보는 순서는 학원이 돈을 냈는지와 무관하다 — 공개 수업 목록의 정렬에
  결제 사실을 넣지 않는다. 유료 기능은 학원이 자기 데이터로 하는 일에만 붙인다.

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
- 신청 상태 값은 `new | reviewing | confirmed | completed | canceled` 다섯 개를 유지한다. 상태 이름/의미를 임의로 바꾸거나 별도 상태 체계로 재설계하지 않는다.
  - 현재 학원 액션: 일정 확정(new·reviewing → confirmed), 체험 완료(confirmed → completed), 취소(new·reviewing·confirmed → canceled), 노쇼(confirmed → canceled + `no_show_at`).
  - `reviewing`은 기존 신청 호환용이다. `move_to_reviewing`의 허용 상태가 비어 있어 새로 reviewing이 되는 경로는 없고, 화면은 new/reviewing을 같은 "신규 신청"으로 보여준다.
  - 노쇼는 별도 상태가 아니라 canceled + `no_show_at`이다. "체험 진행 중"은 화면 전용 파생 상태다.
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
