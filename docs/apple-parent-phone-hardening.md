# Apple Parent Phone Verification HARDENING — Production release

2026-10-04. 기준 commit `a6a05d6876cdd5e8a5be4468cb27c07d921dbfd6`의 별도 worktree에서 구현·검증한 11개 파일을 사용자 승인에 따라 최신 main 기반 clean integration에 반영했다. HARDENING migration은 Production 적용·검증 완료이며, 이 커밋은 대응하는 웹 변경의 배포 단위다. 운영 SMS/신청/계정 수정은 실행하지 않았다.

## 상태 계약과 보호 범위

신청 차단 조건은 `phone_verification_required = true AND phone_verified_at IS NULL` 하나다. `phone IS NULL` 또는 OAuth provider만으로 차단하지 않는다. 신규 Apple 분류는 기존 service-only enrollment RPC에 남기고, 이후 UI 상태 조회와 DB 쓰기는 명시적 두 필드를 사용한다. Profile이 아직 없으면 private enrollment의 같은 두 필드가 상태 원천이다.

`required=false` 기존 Apple/Kakao의 이름·생년월일·연락처 수정은 유지한다. 전화번호 없는 grandfather의 DB 신청도 허용한다. 기존 신청 action의 연락처 필수 검증은 이번 hardening과 별개로 유지한다.

## DB 경계

별도 migration: `supabase/migrations/20261004120000_apple_parent_phone_verification_hardening.sql`.

- `trial_applications`의 BEFORE INSERT trigger가 Parent profile 상태를 잠금 후 확인하고, 필요 시 `parent_phone_verification_required` / SQLSTATE `42501`을 반환한다. 체험수업과 레벨테스트에 동일 적용한다. 기존 RLS가 신청자 소유권과 신청 필드를 계속 검증한다.
- `profiles`의 BEFORE INSERT / 보호 필드 UPDATE trigger는 required 변경과 인증 시각 위조를 차단한다. 인증 대상의 phone/시각은 private `app.parent_phone_verifications`의 OTP proof와 정확히 일치해야 한다. 이름·생년월일만 바꾸는 UPDATE는 허용한다.
- Profile 미생성 상태에서는 enrollment와 같은 `auth.users` row lock으로 동시 삽입을 직렬화한다. 이미 등록된 인증 대상이 필드를 생략해 default-false profile을 삽입하는 우회도 막는다. Enrollment 이전의 provider 분류를 새 trigger로 재설계하지 않는다.
- 기존 service-only OTP verify RPC만 private proof를 생성한다. 같은 transaction에서 proof → canonical phone/시각 반영 → challenge consume으로 완료한다. `required=true`를 유지한다. 이후 profile completion은 검증된 proof를 그대로 복사할 수 있다. 클라이언트 payload, 역할 문자열, 임의 GUC는 proof가 아니다.
- 기존 RLS policy와 public RPC signature/권한은 유지한다. Private status/required 함수 구현은 provider 재판정 대신 명시적 상태를 읽는다. 새 trigger 함수에는 클라이언트 EXECUTE 권한을 주지 않는다.
- Row rewrite, schema 삭제, application UPDATE/DELETE, cancellation, SMS utility, Push 변경은 없다.

## 웹 경계

상태 RPC를 provider와 무관하게 읽고 같은 두 필드로 gate를 판단한다. 기존 계정에서 상태 RPC 실패 시 새 required 상태를 추론하지 않는 COMPAT 동작은 유지하며, 신청 INSERT와 인증 필드 쓰기는 DB guard가 독립 보호한다.

Supabase adapter는 알려진 인증 domain error만 application action에 전달한다. Action은 알림을 보내기 전에 `/auth/complete-phone`으로 redirect하며 `/classes/:id?apply=1&child=...`를 returnTo로 보존한다. 전용 `/classes/:id/apply`의 로그인 진입도 child query를 유지한다. Profile action은 원래 허용한 name/phone/birth-date만 저장하고, 인증된 번호 변경 오류를 안내한다.

## Production 읽기 전용 확인

2026-10-04 작업 시점 집계: grandfather Apple 0명, Kakao required=false 2명, Apple required=true 인증 완료 1명, required=true 미인증 0명. 실제 grandfather Apple 사례가 없어 합성 fixture로 회귀를 검증한다. 인증 완료 profile과 private proof 불일치 0건. 사용자 식별자·번호·OTP·secret은 기록하지 않는다.

Production의 self INSERT/UPDATE RLS 때문에 direct REST가 쓰기 경계다. 따라서 action만 검사하는 것으로는 충분하지 않다. 기존 RLS 전체 재작성 대신 두 trigger를 추가했다. Push table/migration은 Production 미적용이다.

운영 적용 직전 required=false Parent 6명, required=true 인증 완료 1명, 미인증 0명, grandfather Apple 0명을 재확인했다. profiles, trial_applications, children, application_logs, private challenges/verifications, class_schedules, sms_logs, registration_results 총 9개 테이블의 row count와 전체-row fingerprint가 적용 전후 동일했다. 동일 transaction 안에서도 fingerprint 불변을 검사하고 migration history를 기록했다. Schema 비교 결과는 승인된 함수 2개 교체·trigger 함수 2개 추가·trigger 2개 추가뿐이며 기존 RLS/column/grant/index/constraint 변경은 없다. 두 trigger는 정상 활성 상태다.

## 로컬 검증

- `scripts/verify-apple-phone-hardening-db.cjs`: 실제 COMPAT + 기존 application INSERT RLS + 계정 탈퇴 SQL + HARDENING을 격리 PGlite PostgreSQL에 적용. 12 suites: grandfather/Kakao, 두 program type, 미인증 차단, 인증 완료 허용, 필드/GUC/직접 INSERT 위조, 소유권, 실제 OTP RPC, 중복 번호, 탈퇴 cascade, RLS/row 무변경, INSERT-only trigger.
- `scripts/verify-apple-phone-hardening-server.cjs`: 실제 action을 inert adapter/알림 경계와 실행. Domain error redirect, returnTo/child, 알림 미발송, 정상 신청, 기존 연락처 validation, profile payload whitelist 검증.
- 기존 `verify-apple-phone-db.cjs` 16 COMPAT suites, `verify-apple-phone-server.cjs`, `verify-apple-auth.cjs`, auth entry 및 Parent application read boundary verifier.
- 실제 UI component를 사용하는 inert browser fixture: Apple/Kakao UI 4 suites, OTP UI 4 suites, 신청 sheet/전용 화면 8 suites. 각 Chromium/WebKit × 390/430. 실제 OAuth 로그인이나 SMS 발송을 대신하는 운영 E2E라고 주장하지 않는다.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.

완료 결과: 위 검사 모두 PASS, 신규 failure 0. 로컬 production build의 홈/로그인 페이지도 정상 렌더링되며 browser error 및 server error 없음. 작업 전후 운영 6개 테이블의 fingerprint가 동일했고, 원래 작업 폴더의 1,100개 파일 해시/목록도 동일했다. 변경은 별도 HARDENING worktree의 11개 파일에 한정한다.

DB fixture는 `PGLITE_MODULE_PATH`, browser fixture는 `ESBUILD_MODULE_PATH` / `PLAYWRIGHT_MODULE_PATH`로 기존 로컬 도구를 사용할 수 있다. Production credentials가 필요하지 않다. 새 dependency/lockfile 변경은 없다.

## Release 경계

Production release 승인을 받아 이 HARDENING migration 한 개만 적용했다. Pending Push migration을 포함하는 일괄 db push는 실행하지 않았다. Clean integration에서 typecheck/lint/build, DB 28 suites, server/action 회귀와 Chromium/WebKit 390/430 브라우저 16 suites를 다시 통과했다. 승인 파일만 commit하고 origin/main에 fast-forward push한다. Vercel SHA·READY·domain·배포 후 로그 결과는 release 보고에서 확인한다. 실제 계정 재로그인은 사용자 브라우저에서 별도 확인하며, 운영 OTP/SMS E2E는 사용자가 직접 수행한다.
