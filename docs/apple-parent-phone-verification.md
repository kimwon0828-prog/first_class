# Apple Parent 휴대폰 인증 — COMPAT rollout 준비

2026-10-04: COMPAT migration만 Production DB 적용 완료. 웹 commit/push/deploy는 아직 수행하지 않았다. Push 변경은 이 배포 범위에서 제외한다.
이 문서는 기존 DB hardening trigger 기반 설계를 대체한다.

## 확정 계약

Canonical 연락처는 기존 `profiles.phone`. Supabase UUID, Kakao phone 수집, 신청의 `parent_phone` snapshot은 유지한다.

| 계정 | phone_verification_required | phone_verified_at | Phone gate |
|---|---|---|---|
| 기존 Apple Parent | 기본 false | 기존대로 null 가능 | 없음 |
| 기존/신규 Kakao Parent | 기본 false | null 가능 | 없음 |
| 신규 Apple Parent, 인증 전 | true | null | 있음 |
| 신규 Apple Parent, 인증 완료 | true 유지 | OTP 성공 시각 | 없음 |

Phone gate의 유일한 조건은 `phone_verification_required === true && phone_verified_at === null`이다. phone 유무/Apple provider만으로 true를 추론하지 않는다. 기존 계정의 phone을 인증된 것으로 꾸미는 backfill도 없다.

기존 계정의 상태 RPC가 없거나 실패할 때도 true를 만들어내지 않는다. 기존 callback, profile 수정, 신청 흐름은 계속 통과한다. 신규 가입에서 서버 enrollment가 실패하면 로그인 오류/재시도를 표시하고 임의로 profile을 생성하지 않는다.

## 신규 계정 등록

- “신규 Parent”는 기존 `profiles` row가 없는 계정이다. 기존 Apple profile 1개를 포함한 기존 Parent row는 등록 대상이 아니다.
- 검증된 `getUser()` 후 callback/profile 생성 경로에서 service-only `enroll_new_apple_parent_phone(UUID)`를 호출한다.
- RPC는 실제 auth identity, Kakao 연결 여부, 기존 profile 존재, Admin/Studio, Studio signup intent, 탈퇴 상태를 독립 확인한다.
- 기존 profile이 있으면 어떤 flag도 변경하지 않는다. Kakao identity가 연결된 계정도 OTP enrollment를 하지 않는다.
- 신규 Apple에는 private `app.parent_phone_verifications`에 required=true/verified_at=null을 등록한다. 이름이 없다고 임의의 Parent 이름/profile을 먼저 생성하지 않는다.
- read-only status RPC는 profile이 있으면 profile의 flag/시각만, 아직 profile이 없으면 enrollment의 같은 두 상태만 반환한다.
- OTP 성공 시 private verified_at/phone을 저장하고 challenge를 consume한다. 기존 이름 보완 흐름에서 새 profile에 canonical phone, required=true, phone_verified_at을 함께 전달한다.
- UI의 phone은 읽기 전용이며 서버는 제출된 phone/flag/인증 시각을 신뢰하지 않는다. 사용자 metadata로 required를 설정하지 않는다.
- 인증 완료 후 name completion은 별도 기존 흐름이다. 재로그인 시 같은 UUID/인증 시각을 유지하여 OTP를 생략한다. returnTo/child를 보존한다.

## 적용된 COMPAT migration

파일: `supabase/migrations/20261004100000_apple_parent_phone_verification.sql`.

- `profiles.phone_verified_at timestamptz` nullable 추가.
- `profiles.phone_verification_required boolean NOT NULL DEFAULT false` 추가.
- 기존 row의 phone/name/role/UUID rewrite 없음. 기존 required=true backfill 없음.
- private challenge/enrollment 테이블과 OTP RPC만 추가. private RLS/revoke, service-only 발급/검증 권한 유지.
- **profile/application hardening guard, DB trigger를 생성하지 않는다.** 기존 쓰기/신청을 막던 trigger 함수 정의와 trigger 생성문을 COMPAT SQL에서 제거했다. Production에는 위의 additive column/table/RPC만 적용했다.
- 기존 계정 삭제가 Auth user를 지우면 FK cascade가 challenge/enrollment를 정리한다. profile 삭제 직후 Auth 삭제 전에는 기존 account-deletion pending 상태로 RPC 사용을 차단한다. cleanup용 profile trigger도 추가하지 않는다.
- Push migration/table/function은 수정하거나 적용하지 않는다.

이 단계는 호환성을 위한 웹/server onboarding 계약이다. 직접 REST/DB 쓰기로 신규 flag/인증 시각을 변경하거나 profile을 우회 생성하는 것에 대한 DB hardening은 요청대로 별도 단계에 남긴다. OTP RPC 내부 중복 번호 검사/잠금은 유지하지만, 일반 profile 쓰기에 전화번호 예약 제약을 강제하지 않는다.

## OTP 계약 유지

- 기존 Ncloud SENS `sendSms` 사용. SMS event preview 로그에 OTP를 저장하지 않는다. dry-run/실패를 성공으로 처리하지 않는다.
- 6자리 난수, challenge+UUID+code HMAC-SHA256 저장. plaintext OTP/전체 전화번호 로그 없음.
- 만료 5분, 재전송 60초, 검증 5회. 발급 사용자당/번호당 5회/시간, IP당 20회/시간.
- 사용자/현재 Auth session 결합, CSRF 및 중복 submit 방지, 새로고침 시 자신의 활성 challenge 복원.
- 국가번호/하이픈은 중복 비교 시 normalize, 기존 phone 데이터는 보존. 새 인증 phone은 `010` 11자리.
- 다른 Parent 번호이면 `이미 첫수업에 가입된 휴대폰 번호예요.`. 자동 merge/overwrite 없음. 기존 Kakao 로그인/다른 번호 선택 제공.
- Push 등록/권한과 phone 인증은 독립. Push/native 소스 변경 없음.

## 검증

`verify-apple-phone-db.cjs`는 실제 COMPAT SQL을 격리 PostgreSQL에 적용한다. Production에서 확인한 계정 구성(기존 Apple Parent 1 + Kakao Parent 2)을 **합성 fixture**로 재현한다. 운영 사용자의 실제 이름/번호/신청을 수정하지 않는다.

- 기존 전체 row의 기존 컬럼 값 유지, required=false/시각 null, 신규 profile/application trigger 0개.
- 기존 Apple/Kakao 이름 수정 및 DB 신청 insert 가능. 연락처가 없는 기존 계정도 추가 OTP 없음. 신청 UI의 기존 필수 연락처 검증은 그대로이다.
- 신규 Apple 명시적 enrollment → OTP → canonical phone/인증 시각 전달 → 재로그인 통과.
- 만료/재전송/시도 제한/소유권/private hash/중복 번호/역할/탈퇴/quota 16개 suite.

`verify-apple-phone-server.cjs`: flag×timestamp×phone 상태 행렬, missing migration 시 기존 계정 통과, service-only 신규 enrollment, 기존 API/HMAC/returnTo/child 검증.

`verify-apple-auth.cjs`: 기존 Apple callback(번호 있음/없음, status RPC 정상/실패), 기존·신규 Kakao, 신규 Apple true/인증 시각 profile 저장, callback/role/email 충돌 회귀.

추가: 390/430 Chromium/WebKit 기존 Apple/Kakao UI와 OTP UI, application consent 및 Push 회귀, typecheck/lint/build/diff-check.

Production migration 적용 후 기존 Apple Parent 1명/Kakao Parent 2명 모두 required=false, phone gate 없음과 기존 데이터 fingerprint 불변을 확인했다. 실제 계정 이름 수정/신청 insert는 운영 데이터에 실행하지 않고 격리 fixture에서 검증한다. 실제 Apple 신규가입·SMS E2E는 사용자가 웹 배포 후 직접 수행한다. 자동 SMS 발송은 하지 않는다.

## 배포 전 환경 준비

Apple/Kakao Provider와 `http://localhost:3000/**` allowlist는 활성 상태다. 2026-10-04 Vercel Production 설정 이름 점검: 기존 SENS/SMS 설정은 존재하지만 `PARENT_PHONE_OTP_HMAC_SECRET`, `PHONE_OTP_ENABLED`는 없다. 웹 배포 전 Dashboard에서 secret과 `PHONE_OTP_ENABLED=true`를 설정해야 한다. 실제 secret은 출력하거나 생성 파일에 저장하지 않는다.

실행 환경에는 `PHONE_OTP_ENABLED`, `PARENT_PHONE_OTP_HMAC_SECRET`(최소 32자 랜덤), 기존 `SMS_SEND_ENABLED`, `SMS_PROVIDER=ncloud`, 기존 NCP 네 가지 설정이 필요하다. 값은 git/docs/채팅에 저장하지 않는다.
