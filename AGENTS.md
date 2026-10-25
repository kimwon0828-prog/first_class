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
경계는 한 문장이다. **Free는 기록하고 운영하고 학부모와 공유한다. Standard는 기록을 분석하고, 등록하지 않은 학생에게 다시 연락한다.**

Free에서 가능:
- 체험 결과 작성
- 상담 작성/수정, 상담 재오픈 — ⚠️ 현재 UI 미제공. server action과 entitlement flag(`canWriteConsultations`, `canReopenConsultation`)만 남아 있고 화면에서는 이전 상담 기록 조회만 된다.
- 등록 결과 기록
- 리포트 내부 미리보기
- 학부모 리포트 보내기(신규 발행) — 2차-1(2026-10)부터 무료다. 학부모가 리포트를 보고 등록을 결정하기 때문이다.
- Excel 예약 가져오기
- 선생님 등록 — 인원 제한 없음(Free · Standard 모두)
- 학생 목록 · 학생 상세 · 다음 연락(메모 + 날짜) 저장, 학생 상세의 [전화]

Standard 전용:
- 등록 전환 분석
- 미등록 사유 분석
- 등록 전환 인포그래픽
- 학생에게 학원 소식 보내기(다시 연락 문자, 첫수업 이름으로 발송, 월 200건) — `canSendRecontactMessages`. 전환 분석 flag와 따로 둔다(아래 "학생 · 학원 소식 문자").
- 학부모 리포트 새 버전 재발행 — ⚠️ 현재 불가. DB 트리거 `report_send_once`가 신청당 1회 발행만 허용하고(superseded 전환도 막음) 화면도 "보낸 뒤 읽기 전용"이다.

가격 · 체험:
- Standard는 월 39,000원(부가세 포함 총액, 별도 표기 없음). 금액의 주인은 `src/features/billing/lib/plan-catalog.ts` 하나다.
- 새로 승인된 학원은 승인과 같은 transaction에서 Standard 90일 무료 체험이 시작된다(카드 없음, `approve_teacher_signup_request`).
  - 체험 종료 시각은 (승인일 KST + 90일) 00:00 KST다. 화면 · 문자의 "M월 D일까지 / M월 D일에 끝나요"의 D는 그 전날(마지막 체험일)이다.
  - 사업자등록번호(숫자만)당 1회. 기존 승인 학원 · 수동 trialing(PoC) · 데모 override는 손대지 않는다(`trial_origin`이 null).
- 체험 중 카드 등록은 **종료 30일 전부터만** 열린다(전자상거래법 무료→유료 전환 동의). 등록 화면에 결제일 · 금액 · 자동결제 · 해지 방법을 적고 동의 체크를 받는다.
  등록은 빌링키만 발급하고 결제하지 않는다. 마지막 체험일에 첫 39,000원을 결제하고, 새 기간은 종료 시각부터 시작한다.
- 카드를 등록하지 않았거나 체험 중 해지했으면 종료 시각에 무료 플랜이 된다. 첫 결제가 실패하면 기존 갱신과 같이 3일 유예 후 무료다.
- 알림(`src/features/billing/lib/trial-notices.ts`, 크론 `billing-trial-notices` KST 12:30): 카드 등록 창이 열리는 날(종료 30일 전) · 마지막 체험일 7일 전 · 전날("내일") 문자와,
  종료 시각 뒤 결과 문자(무료 전환 / 결제 성공 / 결제 실패). 받는 번호는 학원 담당자 → 학원 대표 → 승인된 가입 신청 담당자, 없으면 skipped.
  중복 발송은 `organization_billing_notices`가 막는다. Studio에는 종료 14일 전부터 상단 안내.

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

## 학생 · 학원 소식 문자(광고) 정책 (2차-3, 2026-10 · 2026-10-25 첫수업 발송으로 전환)
학생 메뉴는 체험 온 학생을 등록하지 않아도 남겨 두고, 새 반 · 특강 · 시간표 변경이 생기면 맞는 학생에게 다시 연락하는 곳이다.

학생:
- 학생은 따로 저장하지 않는다. 신청을 자동으로 묶는다 — 앱 · 웹 신청은 `child_id`, 없으면 학부모 계정 + 학생 이름, 엑셀 신청은 보호자 번호(숫자만) + 학생 이름. 합치기 기능은 없다.
- 학원은 `children`을 읽지 못한다. 학생 화면의 값은 모두 신청 당시 저장된 값(`trial_applications`)이다.
- 탭: 다시 연락할 학생(미등록 + 고민 중) / 등록 학생 / 진행 중 / 전체. 조건: 관심 과목(체험한 수업의 과목 대분류) · 학년 · 결과.
- 다음 연락은 학생의 가장 최근 신청의 `next_contact_at`(그날 09:00 KST) + `follow_up_note`에 저장한다(RPC `set_studio_next_contact`). 그 날짜부터 홈 "오늘 할 일"에 뜬다. 학원에 문자를 보내지 않는다.

보내는 주체: 학원 소식(광고성 문자)은 **첫수업**이 보낸다(대표 결정 2026-10-25). 학원은 받는 학생과 내용을 고르고, 문자는 첫수업 이름으로 나간다.

수신 동의:
- 광고성 문자는 보호자의 사전 동의가 있어야 보낸다(정보통신망법 제50조). 동의는 **첫수업 하나**에 받는다(학원별이 아니다). 학부모 1행(`parent_academy_news_consents`, 동의 시각 · 철회 시각 · 출처 · 문구 버전)과 이력(`parent_academy_news_consent_events`, append-only)으로 남긴다.
- 동의 · 철회는 학부모 본인만 한다(RPC `set_my_academy_news_consent`, 웹 action `setAcademyNewsConsentAction` · 앱 `GET · POST /api/native/me/marketing-consent`). 학원은 자기 학원에 신청한 적 있는 학부모의 동의 여부와 시각만 읽는다(출처 · 문구 버전은 보이지 않는다).
- 옛 학원별 동의(`parent_marketing_consents` · `_events` · `set_my_academy_marketing_consent`)는 발송 판정에 쓰지 않는다. 운영에 남은 행 때문에 표는 아직 두고, 제거는 별도 migration으로 한다. 옛 동의를 새 동의로 옮기지 않는다(보내는 주체가 달라 같은 동의가 아니다).
- 엑셀로 가져온 학생(학부모 계정 없음)과 동의하지 않은 보호자는 고를 수 없다. 학부모 계정 번호(`profiles.phone`, 010 휴대폰)가 없어도 고를 수 없다("보호자 휴대폰 번호가 필요해요").
- 동의 · 철회가 실제로 바뀌면(RPC가 돌려주는 `changed`) 학부모 계정 번호로 처리 결과 서비스 문자를 한 통 보낸다(제50조 제7항, `marketing_consent_notices`에 기록).
- 080 무료수신거부는 첫수업 하나의 번호다. 거부한 번호는 모든 학원 소식에서 뺀다(`marketing_opt_out_phones`, 번호 해시만 — 나중에 앱에서 다시 동의해도 번호 표가 막는다). 매일 오전 NCP 수신거부 목록을 받아 넣고(`/api/cron/marketing-opt-out-sync`), 그 번호가 계정 번호인 학부모의 학원 소식 동의를 철회로 바꾸고(source `opt_out_080`, RPC `withdraw_academy_news_consent_by_opt_out`) 처리 결과 알림을 번호마다 한 번 보낸다.
- 처리 결과 알림 문구: 동의 "[첫수업] 학원 소식 수신에 동의했어요(날짜). 마이 > 학원 소식에서 언제든 끌 수 있어요." / 철회 · 080 "[첫수업] 학원 소식 수신을 거부했어요(날짜). 앞으로 학원 소식 문자는 보내지 않아요."
- 2년마다 수신 동의 사실을 다시 알리는 일은 이번 범위가 아니다(동의 시각만 기록한다).

보내기(`src/features/students/actions/send-recontact.ts`):
- 스탠다드만. 서버 액션의 `requireStudioEntitlement` + DB RPC `reserve_recontact_batch` 안의 같은 판정(`organization_has_paid_access` · 내부 전체 권한) 이중 확인.
- 문자 첫 줄 `(광고) [첫수업] 010-8384-0825`(전송자 명칭 · 연락처 = 첫수업 고객센터 번호, `shared/config/company-info.ts` 한 곳), 둘째 줄부터 `[학원명] 하람이 보호자님, …`, 끝 줄 `무료수신거부 080-…`. 학원 대표번호는 보지 않는다. 080 번호(`RECONTACT_OPT_OUT_NUMBER`)가 없으면 보내기를 잠근다.
- 21:00~08:00(KST)에는 보내지 않는다. 한 번에 50명, 학원마다 한 달(KST 달력) 200건. 보내지 못한 건 · dry_run은 한도에서 빠진다.
- 받는 번호는 **학부모 계정 번호**다(신청서 `parent_phone`이 아니다). 학원 소식 문자 · 동의 알림 · 080 알림이 모두 같은 번호로 간다.
- 받는 사람은 서버가 다시 고른다(첫수업 학원 소식 동의 · 이 학원 신청 · 계정 번호 · 080 아님 · 파기 아님 · 같은 번호 한 통). 화면이 만든 발송 id로 중복 클릭을 막는다.
- NCP는 080 거부 번호를 광고 문자에서 걸러도 요청은 성공(202)으로 받는다. 매일 동기화가 메시지 결과를 조회해 실패 + 080 거부 번호면 `opted_out`("수신거부로 발송 안 됨"), 그 밖의 실패는 `failed`로 바꾼다(둘 다 한도에서 빠진다).
- 보낸 기록(`recontact_batches` 템플릿 · `recontact_recipients` 마스킹 번호 · 상태)은 학생 상세 "연락 기록"에 남는다. 학생 이름이 들어간 완성 문장은 저장하지 않는다.
- `recontact_recipients`는 개인정보 파기(20261022120000) 대상에 들어 있다. `trial_applications`를 참조하는 표를 새로 만들면 같은 migration에서 파기 허용 목록과 파기 함수에 넣는다 — 그렇지 않으면 학부모 탈퇴와 보관 파기가 멈춘다.
- 문자 차단 스위치(`SMS_SEND_ENABLED`)가 꺼져 있으면 dry_run이다. 개발 환경이 운영 DB를 보면 결제와 같은 로컬 가드(`getLocalMutationGuard`, `BILLING_LOCAL_ALLOW=1`)로 막는다.

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
