# 리포트 발행 전 수정·저장 / 발행 후 잠금 — 로컬 검토

기준 origin/main: `884cbda53834a772e8738dd12a071cd7517bf03b`.
**현재 상태: 승인된 DB COMPAT 적용 완료 — 사용자 실제 저장 확인 대기.** `20261007120000` 한 개만 실제 연결 DB에 적용했다. 리포트 앱 변경은 사용자 commit/push 승인 범위다. 후속 신청 상세 UX는 별도 로컬 검토와 승인을 따른다. 고객 저장·발행은 자동 실행하지 않았다.

## 실제 구조와 변경

신청 상세의 `ApplicationTrialResultWorkflow` → `upsertTrialResultAction` → authenticated adapter가 기존 `trial_results` 한 행을 저장한다. 별도 리포트 초안/편집기는 없다. 미리보기는 저장된 관찰·추천·공개 총평을 snapshot builder로 조립하고, 명시적 발행은 기존 `publish_experience_report`가 같은 source revision을 확인한 뒤 `experience_reports`에 immutable snapshot을 만든다. 내부 메모는 발행하지 않는다. Parent는 `experience_reports`의 published snapshot만 읽는다.

기존 Phase 1은 첫 기록 저장부터 action/mock/RPC/trigger가 수정 불가로 만들었다. 이번 제품 기준에 따라 첫 저장을 ‘최종 확정’ 대신 ‘저장’으로 안내하고, **발행 이력이 생기기 전**에는 기존 모달로 수정한다. 최초 저장 및 이후 수정은 같은 source ID를 사용한다. 저장만으로 발행/알림을 호출하지 않는다. 최신 저장 후 refresh/re-entry와 미리보기에 반영한다.

편집 시작 시 source/revision을 고정한다. UI refresh나 다른 사용자의 저장으로 stale draft가 새 revision에 올라타지 않는다. action과 RPC에서 revision이 다르면 실패하며, 입력은 유지한다. 닫기/취소 및 새로고침/이동에 미저장 안내를 둔다. 기존 자유 입력 추천 일정과 legacy 관찰(중복 포함)은 건드리지 않은 저장에서 보존한다. 사람이 관찰을 새로 고르면 canonical 값을 저장하며 기존 발행 조건은 그대로다.

발행 이력(기존 withdrawn 포함)이 있으면 편집 버튼을 제거하고 ‘발행된 리포트는 수정할 수 없습니다.’를 표시한다. 조회 실패는 발행 전으로 간주하지 않는다. 직접 action/RPC와 source INSERT/UPDATE에서도 차단한다. 상담 기록/등록 결과는 별도 경로를 유지한다. 신청관리의 ‘리포트 확인·수정’은 실제 체험 기록 영역으로 이동한다. 탭 분류·정렬·DB 상태 체계는 바꾸지 않는다.

## 기존 발행 계약

초기 발행 SQL/문서에는 새 version 재발행 분기가 남아 있지만, 현재 운영 Phase 1의 `report_send_once`와 `publish_experience_report`의 any-history 검사가 재발행을 차단한다. 현재 UI도 재발행을 제공하지 않는다. 이번에 새 version/정정 발행/철회 UI를 추가하지 않는다. 기존 안전 철회 backend 계약은 그대로 보존하고 철회해도 편집/재발행을 다시 열지 않는다.

기존 `experience_reports_immutable_content` trigger는 privileged direct UPDATE의 content/version/identity와 terminal lifecycle도 보호한다. 이 함수와 1회 발행 함수, Parent RLS는 재사용한다. 기존 발행본을 조립하거나 rewrite하지 않는다.

## 필요한 pending migration

`20261007120000_report_edit_before_publication.sql`:

- 새로운 `save_studio_trial_result` RPC: 기존 완료·학원 권한 guard 및 application → record lock 순서, optimistic revision, 같은 행 업데이트, 내부 로그, 실패 원자성.
- 기존 `lock_final_trial_result` trigger 함수: 첫 기록 저장 대신 any publication history를 잠금 기준으로 사용. 기존 DELETE/식별자·생성 이력 보호를 유지한다.
- source INSERT에도 발행 이력 guard를 추가해 과거 발행본만 있고 source가 없는 legacy 사례의 구 RPC 우회를 막는다.

기존 row rewrite, DROP, RLS/policy 제거, table DML grant 확대 없음. 최소 RPC EXECUTE만 기존 authenticated 역할에 부여하며 실제 authority는 own-org completed guard가 검사한다. Production 적용은 사용자 명시 승인 이후 별도 검증·COMPAT → APP READY 반영이 필요하다.

## 현재 로컬 실행 환경

사용자 요구에 맞춰 사용자용 fixture 인증 bridge, 검토용 입장 버튼과 `/review` 진입, 별도 검토 서버 및 그 연결용 harness를 pending diff에서 제거했다. `next.config.mjs`는 기준 HEAD와 정확히 같다. 제거한 harness와 이미 수행한 테스트 증거는 저장소 밖의 작업 evidence에 보관한다. 제품 리포트 UI/action/adapter와 pending migration은 그대로 유지한다.

실제 수정 worktree `/tmp/firstsuup-report-edit`의 Next 앱을 `http://localhost:3000`에서 실행한다. 원래 WEB의 `.env.local`을 Next의 기존 env loader로 읽어 child process에 전달하며 env 파일 복사·rewrite나 값 출력은 없다. 원래 dirty WEB과 수정 worktree의 서버가 함께 3000에 떠 있던 것을 확인해 두 Firstsuup 서버를 정상 종료하고 정상 앱 하나로 교체했다. 사용자용 fixture HTTP bridge와 별도 PostgREST review 서버는 종료했다. 운영 Auth 설정·권한·고객 데이터는 변경하지 않는다.

일반 학원 로그인: `http://localhost:3000/studio/sign-in`.
일반 Parent 로그인: `http://localhost:3000/auth/sign-in`.
신청 목록: `http://localhost:3000/studio/applications`.
사용자는 평소 테스트 계정으로 직접 로그인한다. 자동 고객 기록 수정·저장·발행과 외부 알림은 수행하지 않는다.

## 승인 전 확인한 DB 상태 — 이후 단일 COMPAT 적용 완료

읽기 전용 metadata 확인에서 `save_studio_trial_result` RPC와 source INSERT 발행 이력 guard는 없으며 기존 source lock도 첫 기록 저장 기준이다. 따라서 **새 adapter를 쓰는 이번 소스의 체험 기록 신규 저장 및 수정 저장은 pending migration 적용 전에는 동작하지 않는다**. 정상 Auth와 기존 신청/발행 snapshot 조회에는 이 새 RPC가 필요하지 않다. 구 저장 RPC fallback이나 fake 데이터/인증으로 이를 덮지 않는다.

필요한 변경은 앞 절의 `20261007120000_report_edit_before_publication.sql`이다. 사용자 승인 후에만 COMPAT DB 적용 → 검증 → APP READY 반영을 진행할 수 있다. 이번 복구 단계는 commit/push/Production migration/배포 없이 대기한다.

## 검증 범위

기존 격리 DB/RLS/RPC/동시성 및 snapshot/체험 기록/신청관리 검증, typecheck/lint/build 결과는 변경 전 evidence로 유지한다. 사용자용 fixture Auth/browser 결과는 실제 Supabase Auth 또는 Production mutation 성공으로 해석하지 않는다.

이번 복구에서는 기준 config 일치, 일반 Parent/Studio 로그인 UI, `/review` 404, 미인증 상세의 정상 로그인 redirect, 실제 Supabase Auth settings의 읽기 연결, 연결된 DB metadata, runtime 오류/5xx 및 fixture 요청 없음, 원래 workspace/hash 보존과 diff-check만 확인한다. 실제 계정의 인증 후 신청 상세는 사용자 로그인 후 관측해야 한다. 이미 통과한 build/typecheck 및 무관한 회귀/DB mutation 검증은 반복하지 않는다.

## 이번 제품 변경 파일

- `app/studio/(dashboard)/applications/[id]/page.tsx`
- `docs/studio-application-detail-workflow-v2.md`
- `docs/studio-report-edit-before-publication.md`
- `docs/studio-workflow-phase1-rollout.md`
- `scripts/verify-cases-classification.ts`
- `scripts/verify-report-edit-lock-db.cjs`
- `scripts/verify-trial-record-modal.ts`
- `scripts/verify-trial-result-observations.ts`
- `src/features/studio/actions/upsert-trial-result.ts`
- `src/features/studio/lib/application-detail-workflow-state.ts`
- `src/features/studio/lib/cases-workflow.ts`
- `src/features/studio/lib/trial-recommended-schedule.ts`
- `src/features/studio/ui/application-report-publishing.tsx`
- `src/features/studio/ui/application-trial-result-workflow.tsx`
- `src/shared/lib/db/adapter.ts`
- `src/shared/lib/db/mock-adapter.ts`
- `src/shared/lib/db/supabase-adapter.ts`
- `supabase/migrations/20261007120000_report_edit_before_publication.sql`

## 실제 계정의 편집 진입 및 DB 적용 승인 검토

정상 localhost:3000과 실제 Supabase Auth 세션에서 사용자가 열어 둔 미발송 신청의 ‘체험 기록 수정’을 실제 클릭했다. 현재 Chrome에서는 native dialog가 열렸고 viewport 안에서 편집 가능한 총평 필드를 확인했다. 새로고침 후에도 재진입이 가능했으며 page error/console error/실패 응답은 관측되지 않았다. 저장·발행·고객 데이터 쓰기는 실행하지 않았다. 이 관측을 사용자 실패의 원인 해결이나 수정 성공으로 보고하지 않는다. 실패한 URL/브라우저와 같은 사례인지 확인이 필요하다.

현재 DB의 source trigger 함수는 모든 UPDATE/DELETE에서 `trial_result_already_finalized`를 발생시킨다. 새 저장 RPC와 INSERT publication-history guard는 없다. 클라이언트 anon/authenticated의 source INSERT/UPDATE/DELETE grant도 없으며 우회하지 않는다. 새 adapter는 최초 저장과 수정 모두 새 RPC를 사용하므로 두 저장 모두 DB 준비 전에는 불가능하다.

DB 승인 대상은 기존 pending migration 한 파일이다: 새 `save_studio_trial_result` RPC(authenticated EXECUTE + 기존 학원/완료 guard, optimistic revision, application→record 잠금), 기존 source trigger 함수의 publication-history 기준 교체, source INSERT publication-history guard 추가. 데이터 rewrite/DROP/기존 정책 제거/table DML 권한 확대는 없다. 발행 이력이 있으면 철회 후에도 편집을 열지 않으며 기존 snapshot/Parent RLS/1회 발행 계약은 유지한다.

COMPAT에서 기존 운영 앱이 사용하는 `finalize_studio_trial_result`는 그대로 남아 미발행 신규 기록 생성 계약을 유지한다. 현재 실제 DB의 workflow/finalize/publish/snapshot immutable 함수 정의는 앞서 검증한 격리 DB 정의와 같다. 기존 앱은 새 수정 기능을 사용하지 않으며 APP READY 전에는 기존 UI 동작을 유지한다. source가 없는 발행 이력에서 구 finalize를 통한 내용 생성은 새 INSERT guard로 막히며 이는 발행본 우회 방지에 필요한 의도된 제한이다. Production DB 적용·실제 저장 E2E·발행 E2E는 승인 전 실행하지 않는다.

## DB 승인 전 사용자 확인에 따른 문제

사용자는 같은 실제 신청에서 편집 창이 열린다고 확인했으며, 비활성화된 버튼이 ‘리포트 발송’이라고 지정했다. 실제 화면에서도 편집·저장 버튼은 활성이고 리포트 발송은 legacy observation blocker로 비활성임을 확인했다. 현재 관찰 항목은 직접 선택한 뒤 DB에 저장해야 preview와 발행 조건이 갱신된다. 미저장 선택을 발행 대상으로 간주하지 않는다. 현재 새 RPC가 없으므로 그 저장 단계가 불가능하다. 발송 버튼의 검증 조건이나 필수 항목을 우회하지 않는다.

승인 대상은 pending migration의 COMPAT DB 적용이다. 기존 운영 UI/구 finalize RPC와 발행 API는 유지하며, 새로운 save RPC 및 source publication guards만 반영한다. 사용자 승인 전에는 DB 적용·고객 기록 쓰기·발행·git 반영·배포하지 않는다. 승인 이후에도 실제 신청의 편집/저장/발행 검증은 사용자 본인이 수행하며 자동 고객 mutation은 금지한다.

## 2026-10-07 승인된 단일 DB COMPAT 적용

사용자가 `20261007120000_report_edit_before_publication.sql` 한 개의 실제 연결 DB 적용을 명시 승인했다. 기존 WEB 환경의 프로젝트와 실제 대상 일치, 프로젝트 ACTIVE_HEALTHY, origin/main 및 worktree HEAD `884cbda53834a772e8738dd12a071cd7517bf03b`, 검증된 SQL SHA 일치와 기존 운영 함수 무변경을 적용 직전에 확인했다.

승인 SQL과 해당 버전 history 한 건만 같은 transaction으로 적용했다. 다른 pending migration은 실행하지 않았다. 사후 검증에서 새 save RPC 및 source lock 정의가 기존 격리 검증 DB 정의와 정확히 같고, authenticated EXECUTE만 가능하며 anon/PUBLIC 실행과 직접 source DML은 불가능함을 확인했다. source UPDATE/DELETE 및 INSERT guard, 기존 발행 snapshot immutable/1회 발행 trigger, 기존 finalize/publish/workflow, 관련 RLS/ACL은 유지됐다. 기존 migration history 전체는 보존됐다.

검증 과정의 실패도 기록한다. 임시 verifier가 PostgreSQL trigger 이벤트 출력 순서를 잘못 가정한 것을 수정했다. 이력에 넣은 SQL 문자열의 `$$`가 JS replacement 처리에서 `$`로 축약된 오류는 승인 버전의 history 텍스트만 원문으로 고쳤으며, 실제 함수 정의는 처음부터 검증 SQL과 같았다. 이후 history 원문 및 다른 history 불변 검증은 통과했다. OpenAPI 전체 조회는 프로젝트 정책상 401(Secret API key required)이므로 권한을 우회하지 않았다. 기존 실제 계정으로 RPC OPTIONS 경로의 200 및 POST 허용을 확인했다.

정상 localhost:3000, 기존 Supabase Auth·계정·env 및 source worktree는 유지했다. 실제 고객 저장/발행 호출, 외부 알림, git staging/commit/push 또는 앱 배포는 실행하지 않았다. 사용자 직접 확인은 같은 실제 미발송 신청에서 현재 관찰 선택·총평 수정 → 저장 → 재진입 → 미리보기이며 기존 발행본은 계속 편집 잠금이다. 자동 고객 쓰기 E2E는 미실행이다.
