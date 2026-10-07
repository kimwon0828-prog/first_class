# Phase 1A 확장 / Phase 1B 잠금 전환

> 발행 전 수정·저장 / 발행 후 잠금 계약은 [후속 변경](studio-report-edit-before-publication.md)을 따른다. DB COMPAT는 승인 후 적용했고 앱 변경의 commit/push도 승인됐다. 아래 최초 저장 잠금 설명은 기존 Production 이력이다.


2026-09-30. 실제 계정 localhost 조회 QA를 위한 승인 범위다. 운영 업무 데이터 저장, 1B 적용, 앱 배포는 포함하지 않는다.

## 원본과 source/history 관리

- origin/main을 새 fetch로 확인: `dd1e9921d6f53da0886ce8d27a66d09fa2afc212`.
- 통합 원본 `20260930100000`은 Local에만 적용돼 있었고 Production history에는 없었다.
- 원본 SQL은 `docs/sql/archive/20260930100000_studio_experience_workflow_phase1.sql`에 **byte-identical** 보관했다. 자동 migration 순서에서는 제외한다. 적용했던 내용을 같은 version으로 편집하지 않았다.
- canonical 순서: `20260930110000_studio_experience_workflow_phase1_expand.sql` → `20260930111000_studio_experience_workflow_phase1_harden.sql`.
- Local 통합 이력은 백업 후 최종 스키마 동등성을 검증하여 canonical 이력으로 전환한다. fixture/업무 row reset·삭제·backfill은 하지 않는다. Production에는 1A만 명시적으로 적용한다. 전체 `db push`는 금지한다.

## 통합 SQL의 statement 분류

| 통합 원본의 statement | 단계 | 판단 |
|---|---|---|
| trial_applications의 reason IDs / note 추가 | 1A | 기존 payload에 없는 새 필드. 빈 배열 default / nullable note |
| consultation_logs.time_flexibility + 새 컬럼 CHECK | 1A | 기존 INSERT는 NULL. 기존 row·필드에는 제약 변화 없음 |
| studio_trial_applications view 확장 | 1A | 기존 열 순서·ownership 조건·CHECK OPTION·ACL 보존, 새 열만 끝에 추가 |
| application_logs.is_internal + Parent SELECT 정책 | 1A | 기존 이벤트는 false로 기존 노출 유지. 새 private event만 숨김; 새 RPC 도입과 동시 적용 필요 |
| workflow_studio_application + private helper ACL | 1A | 새 이름. auth.uid/role/조직/completed 검증과 신청 잠금 |
| finalize_studio_trial_result + 새 함수 ACL | 1A | 신규 command 자체의 최초 INSERT 검사. 구형 upsert 경로는 아직 유지 |
| set_studio_registration_result + 새 함수 ACL | 1A | 신규 독립 저장. 기존 상담·다음 연락값을 변경하지 않음 |
| validate_contact_preference function | 1A | 새 RPC에서만 호출. 기존 writer에 trigger로 연결하지 않음 |
| record_studio_contact + 새 함수 ACL | 1A | 신규 구조화 연락 command. 기존 결합 RPC 그대로 유지 |
| Studio view UPDATE 회수·column allowlist | 1B | 구형 직접 등록/reopen writer 차단 |
| trial_results INSERT/UPDATE/DELETE 회수 | 1B | 구형 체험 기록 저장 차단 |
| lock_final_trial_result function + trigger | 1B | 저장된 기록 UPDATE/DELETE 차단 |
| experience_reports DML 회수 | 1B | 직접 쓰기 경로 제한 |
| report_send_once function + trigger | 1B | 과거 발행이 있으면 추가 발행/삭제/버전교체 차단 |
| validate_new_contact_snapshot + trigger | 1B | 기존 writer에 새 JSON 검증을 강제하므로 확장 단계 제외 |
| create_studio_consultation EXECUTE 회수 | 1B | 구형 상담/등록 action을 깨뜨림 |
| publish_experience_report 교체 | 1B | 기존 재발행 계약을 발송 1회로 변경 |
| schema cache notify / BEGIN·COMMIT | 각각 | 각 단계 원자 적용, lock_timeout 5초·statement_timeout 60초 |

새 index/table/native enum은 없다. 1A에서 기존 함수 본문/ACL, 기존 table/column ACL, trigger, 기존 CHECK는 변경하지 않는다. **1A 기간에는 기존 앱 쓰기가 계속 가능하므로, DB 전체의 체험 기록 불변성·발송 1회를 보장하지 않는다.** localhost는 READ UI QA만 한다.

## 실제 schema에서 발견한 legacy 호환성 보정

기존 `trial_applications_unregistered_reason_status_check`는 active legacy reason이 있으면 not_enrolled 상태를 요구한다. 통합 원본의 새 RPC는 이를 남겨 두어 과거 사유가 있는 신청을 enrolled로 변경하면 실패했다. 운영 스키마 복제에서 재현했다.

1A의 새 RPC는 not_enrolled 밖으로 전환할 때 기존 active reason/note를 NULL로 정리하고, 원문을 같은 transaction의 `application_logs` private before snapshot에 보존한다. CHECK를 약화하지 않고, 사유 taxonomy 매핑·과거 데이터 일괄 수정도 하지 않는다. 현 운영 앱의 기존 함수는 수정하지 않는다.

## 검증 범위

`scripts/verify-studio-workflow-phase1-rollout.cjs <production-schema.sql>`은 운영 `public,app` **schema only** dump와 로컬 Auth schema로 disposable Local DB를 만든다. 실제 사용자 row를 복사하지 않는다. 인증 역할과 JWT claims를 설정해 실제 SQL/RLS/함수를 호출한다. 완전한 Auth HTTP 로그인 검사는 이전 Phase 1 JWT/browser 검증과 구분한다.

- 모든 기존 함수 정의/ACL·table/column ACL·trigger·기존 제약과 무관한 policy/view 전후 동일성.
- 구형 상담/등록 RPC, 직접 view 등록 저장, 체험 기록 INSERT/UPDATE, 리포트 발행·재발행.
- 신형 확정/등록 사유/연락 JSONB/유연성/리포트 계약, legacy 사유 보존.
- Parent private field/event, 타 조직 접근, anon EXECUTE 차단.
- 1B 후 구형 경로 폐쇄, 신규 저장 정상, 중복 확정·발행 차단, 동시 확정 10건 중 1건 성공.
- rollback 실행 후 신규 command 차단·기존 writer 및 private history 보존.

Local PostgreSQL 17.6에서 회수된 함수 EXECUTE를 raw `SET ROLE`로 호출할 때 엔진 signal 11이 발생했다. DB는 자동 복구됐으며 이 실패를 PASS로 세지 않았다. 해당 두 권한 검사는 `has_function_privilege`의 실효 ACL로 검증한다. 신규 함수 내부 조직 거부, table 쓰기 거부, 중복 확정/발행 거부는 실제 실행한다. 운영 DB에서 오류를 재현하지 않는다.

## Production preflight / rollback

운영 history 최신 `20260929100000`; `20260930*` 없음. 새 컬럼/함수/trigger 이름 충돌 없음. schema catalog와 업무 table의 count/hash만 조회했으며 PII는 출력하지 않는다.

적용 직전에 기존 catalog를 다시 대조하고, 1A 파일과 migration ledger를 한 transaction으로 적용한다. 적용 후 기존 함수/ACL/trigger/CHECK·업무 row fingerprint 동일성과 1A-only history를 확인한다. DB schema 변화는 승인된 1A DDL이며 운영 업무 데이터 write와 구분한다.

긴급 중지 SQL: `docs/sql/manual/rollback_studio_workflow_phase1_expand.sql`. 새 command EXECUTE만 중지하며 컬럼/기존 데이터/내부 이벤트 정책/history를 보존한다. 기존 writer는 1A에서 변경하지 않았으므로 원복할 기존 함수가 없다. DROP COLUMN·DROP VIEW·데이터 삭제를 rollback으로 사용하지 않는다.

## 조회 QA 경계

원래 `.env*`는 그대로 두고 localhost 실행 프로세스의 Local Supabase override만 제거한다. 기존 설정의 Production Supabase/Auth로 일반 로그인 페이지를 제공한다. 실제 비밀번호를 요청·복사하지 않으며 자동 로그인·service-role impersonation을 하지 않는다.

조회 URL: `/studio/sign-in`, `/studio`, `/studio/cases`; 실제 신청은 Cases에서 연다. 체험 기록 확정·리포트 발송·등록 결과 변경·상담 저장은 누르지 않는다. 별도 실제 쓰기 QA는 추가 승인과 전용 신청 준비 후 수행한다.

Vercel connector와 직접 token 조회는 처음에 403이었으나 기존 CLI 인증을 통한 inspect/API/logs 조회는 성공했다. 아래 최종 결과를 기준으로 한다. 사용자의 운영 비밀번호나 session을 가져와 인증 화면을 자동 검수하지 않는다.

## 완료 기록

- 1A Production 적용 완료: `20260930110000`. SQL과 ledger를 단일 transaction으로 commit했다. 첫 시도의 ledger 문자열 생성 오류는 SQL parse에서 거부되어 스키마 변화가 없었고, 실제 적용 transaction 전체를 로컬에서 재검증한 뒤 적용했다.
- 1A source SHA256: `3a1c382b3d9755eb815a1ee6288b7507d156390dfe0ad88001b05b4ed0059322`.
- 운영 사후 catalog 검사 PASS: 신규 RPC/helper 5개 signature·정의·ACL이 rehearsal과 일치. 모든 기존 함수/권한/trigger/CHECK와 무관한 정책은 동일. 1B/통합 원본 migration은 Production history에 없다.
- 운영 업무 row fingerprint 동일: 신청 62, 기록 18, 리포트 4, 상담 21, 등록 결과 16, 신청 로그 216, SMS 로그 196. 원문/PII 출력 없이 count/hash만 비교. 업무 데이터·Storage·기존 계정 비밀번호 변경 없음.
- Local production-schema rehearsal **20 PASS**. 실제 migration ledger까지 포함한 1A transaction 재검증 PASS. 분리 migration 전체 적용 verifier PASS, trial-result observations verifier PASS, typecheck/lint/diff-check PASS. 제품 TSX/action/adapter 변경이 없어 build는 이 단계에서 반복하지 않았다.
- Local 원래 통합 migration ledger를 `/tmp/studio-phase1-transition-9kFIpS/local-original-migration-ledger.json`에 보관. 9개 관련 함수 정의와 핵심 hardening 권한의 동등성을 확인하고, 새 등록 RPC의 legacy 호환 보정 + canonical 1A/1B history 전환을 한 Local transaction으로 완료. fixture row는 변경하지 않았다. 원본 SQL archive hash도 작업 전과 동일하다.
- Vercel Production: `dpl_J7FxKAhRyKLFxkURczxLdU6ymVUx`, READY, SHA `dd1e9921d6f53da0886ce8d27a66d09fa2afc212`. 기존 배포 그대로. 최근 30분 error 로그 0건.
- 운영 로그인 HTTP 200. Dashboard/Cases/Application Detail/Schedule의 비인증 요청은 정상 로그인 307. 인증된 운영 페이지 내부 조회는 사용자 session이 없어 SKIP; 이를 실제 데이터 화면 검수 PASS로 주장하지 않는다.
- localhost:3000 원래 프로젝트의 `npm run dev` 유지 (npm PID 10594, Next PID 10607). 기존 Local override 프로세스만 종료했으며 새 프로세스에는 별도 env override를 넣지 않았다. 기존 `.env.local`이 가리키는 `vfkfpekfwrjjocltqbty.supabase.co` 사용. 기존 `.env*` checksum 동일.
- localhost 로그인 200/보호 route 로그인 redirect 확인. 서버 access log에는 사용자의 일반 로그인 `303` 이후 `/studio`, `/studio/cases` `200`이 확인됨. Codex는 실제 credential 입력/조회/자동 로그인/impersonation을 하지 않았다. 별도 빈 로그인 창을 열어 두었다.
- 이번 source 변경은 migration 분리/원본 archive/rollback SQL/검증 스크립트/이 문서뿐. 제품 코드, 기존 dirty/untracked, branch/HEAD/staged 보존. commit/push/main/deploy 없음.
- 증거: `/tmp/studio-phase1-transition-9kFIpS/`에 Production pre/post catalog·fingerprint, local rehearsal 결과, 배포/HTTP smoke, 원래 파일 fingerprint를 보관했다. 실제 로그인은 사용자가 직접 한다.

**운영에는 1A만 적용됐으며 1B는 보류다. 현재 QA는 조회 전용이고 저장/확정/발송을 테스트하지 않는다.**

## Final Release 승인 및 배포 순서 (2026-09-30)

위의 1A-only 완료 기록은 이전 단계의 이력이다. 사용자 FINAL RELEASE 요청으로 승인 범위가 **Phase 1 앱 배포 및 1B hardening 적용**까지 확대됐다. 추가 UI 변경 없이 승인된 12개 기능을 clean integration에서 묶는다.

- integration 기준: 새 fetch로 확인한 `dd1e9921d6f53da0886ce8d27a66d09fa2afc212`. 기존 working tree/환경변수와 기존 main의 Parent·프로필·일정·알림 기능은 보존한다.
- A source SHA256 `3a1c382b3d9755eb815a1ee6288b7507d156390dfe0ad88001b05b4ed0059322`와 Production ledger의 SQL 원문 해시가 일치한다. A 재적용 및 전체 `db push`는 하지 않는다.
- 앱을 먼저 main에 fast-forward하고 Vercel READY/SHA/domain을 확인한다. Phase 1A 상태에서 로그인 및 보호 route smoke를 확인한 후에만 B `20260930111000`을 적용한다.
- B 적용은 source SQL + migration ledger가 같은 transaction이다. A 존재, B/구 통합 이력 부재, 기존 publish 함수 hash를 재확인하는 guard를 둔다. 적용 전후 업무 row fingerprint와 catalog를 대조한다.
- `verify-studio-workflow-phase1-production.sql`은 TEST 조직/계정을 transaction 안에 생성하고 authenticated JWT claims로 same-org/other-org/Parent/RLS/RPC를 검사한 뒤 **ROLLBACK**한다. 운영 계정·신청 수정, Auth API 계정 생성, SMS/provider 호출은 하지 않는다. anon/구 RPC는 실효 ACL로 검사하며 알려진 Local 엔진 crash를 재현하지 않는다.
- 사용자 요청에 따라 인증된 UI 검수는 원래 localhost 세션에서 수행한다. Production 비인증 redirect 확인을 인증 화면 내부 검수로 표현하지 않는다.

### 릴리스 검증 기준

- clean integration: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- 실제 Local Auth JWT/PostgREST/RLS: `PHASE1_OUTPUT_DIR=<evidence>/jwt node scripts/verify-studio-workflow-phase1-db.cjs` — 58개 검사. 확정/발행/등록/SMS eligibility/연락 멱등·동시성·rollback·권한·private 필드·Parent snapshot을 포함한다. 테스트 fixture는 운영과 분리된 Local DB에만 생성한다.
- schema-only disposable DB: rollout verifier 20개 검사 + 실제 B/ledger transaction 검사. Production preflight catalog가 이전 A 이후 catalog와 일치함도 확인한다.
- rollback-only Production smoke SQL: 먼저 Local에서 32개 검사 PASS 확인 후 실제 B 이후 동일 SQL을 실행한다.
- 실제 component/route를 import하는 UI verifier: 14개 화면 상태, 1440/1280/1024, 담당자/상담/체험 모달 focus·draft·pending·성공/실패, Parent report 390/768. 모의 action 경계에서만 submit한다.
- 기존 `verify-consultation-atomicity.ts`는 구 결합 RPC가 상담과 등록을 동시에 저장한다는 **폐기된 계약**을 검사하므로 Phase 1B에서 예상대로 실패한다. main과 파일이 동일하며 제품 회귀가 아니다. Phase 1 이후 원자성/멱등성 검증은 위 58개 JWT verifier 및 rollout verifier로 대체한다. 구 검사 결과를 PASS로 계산하지 않는다.
- 프로젝트 공식 `npm run lint`는 PASS. 별도 전체 디렉터리 ESLint 실행은 기존 `verify-marketplace-neutrality.ts` require 및 Next 생성 `next-env.d.ts` 규칙으로 실패하며 이번 릴리스 변경은 아니다. 무관한 파일이나 lint 설정을 수정하지 않는다.

B 이후 앱 rollback이 필요하면 먼저 쓰기를 중지하고 원인을 확인한다. 구 앱만 즉시 rollback하면 B의 권한 회수와 충돌한다. A 컬럼/내부 이력은 삭제하지 않는다. B 권한·trigger·publish 함수의 원복은 적용 전 catalog에 근거해 별도 승인·검증한다. 운영 데이터를 삭제하거나 immutable trigger를 우회해 정리하지 않는다.

릴리스 상세 증거와 실제 최종 SHA/배포/적용 결과는 `/tmp/studio-phase1-release-Bt9k3E/`에 기록한다.
