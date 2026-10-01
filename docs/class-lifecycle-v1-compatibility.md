# Class Lifecycle V1 — COMPAT / HARDENING 호환성 보정

> 아래는 호환성 보정 당시의 기록이다. 이후 COMPAT 적용은 `class-lifecycle-v1-compat-production-apply.md`, 최종 릴리스 순서·검증은 `class-lifecycle-v1-release.md`를 따른다.

2026-10-01. Production에는 적용하지 않았다. 이번 결과는 migration source, 새 임시 로컬 DB 리허설, verifier, 다음 전환 준비다.

## 1. 기존 문제 SQL

기존 단일 migration의 `app.guard_class_lifecycle`은 RPC의 transaction flag가 없는 모든 classes DELETE를 `class_delete_requires_lifecycle_rpc`로 차단했다. 구 앱 `cleanupCreatedStudioClass`의 일정 DELETE → classes DELETE 경로와 충돌했다.
기존 replacement는 `if c.is_active and c.archived_at is null`로 자동 생성을 제한했다. Production의 `if c.is_active or r.operation_type = 'fixed_period'` 계약을 바꾸는 문제였다.

## 2. COMPAT — 20261001130000

파일: `supabase/migrations/20261001130000_class_lifecycle_v1_compat.sql`.

- `classes.archived_at timestamptz NULL` 추가. 기본값/backfill/기존 행 UPDATE 없음.
- 신규 `app.class_has_operating_history`, `get_studio_class_delete_eligibility`, `mutate_studio_class_lifecycle` 추가.
- 신규 함수에만 최소 execute 권한 적용. existing RPC revoke 없음.
- 기존 함수 replacement, 기존 RLS/trigger/constraint 변경, direct DELETE 차단 없음.
- 새로운 인덱스 없음. 기존 organization 조회 인덱스 사용.
- archive/restore/delete RPC의 소속·role 검사, 잠금, 실제 운영 이력 판정은 유지.

**COMPAT 단독 적용 구간은 read/render 검수만 한다. 실제 archive/restore/delete/public toggle은 실행하지 않는다.** 기존 앱이 새 archived 상태를 처리하도록 바뀐 단계가 아니므로 새 상태를 만들어 두지 않는다.

## 3. HARDENING — 20261001131000

파일: `supabase/migrations/20261001131000_class_lifecycle_v1_hardening.sql`.

신 앱 Production READY 및 비파괴 smoke 후에만 적용한다.

- direct DELETE 차단 및 lifecycle RPC 경유 강제.
- `classes_archived_private` CHECK와 공개 RLS의 미종료 조건.
- archived metadata/publish/rule/manual schedule write guard.
- Parent application RLS helper와 모든 신규 신청의 class lock/종료 guard.
- 기존 reconcile 함수에 archived early return 추가. 생성 조건은 **기존 Production과 동일**하게 유지.

## 4–6. 최종 계약

| 경로 | Production 기준 | COMPAT | HARDENING |
| --- | --- | --- | --- |
| 구 앱 create failure direct cleanup | 가능 | 동일하게 가능 | raw DELETE 차단, 신 앱 cleanup RPC 사용 |
| 신규 permanent-delete RPC | 없음 | 이력 없으면 가능 | 이력 없으면 가능 |
| nonarchived private rolling | 신규 자동 생성 중지 | 동일 | 동일 |
| nonarchived private fixed_period | 지정 기간 생성 가능 | 동일 | 동일 |
| archived rolling/fixed_period | 상태 없음 | 실제 상태 변경을 하지 않는 전환 구간 | reconcile/refill/generation 0 |

archive = archived_at set + is_active false, restore = archived_at NULL + is_active false.
자동 공개 없음. 신청/일정/규칙/예외/리포트/상담/등록 이력 보존, Parent 신규 탐색/신청 차단의 최종 계약은 유지한다.
렌더 검증에서 단일 행 메뉴 상단이 기존 workspace overflow에 잘리는 문제를 발견하여 `overflow: visible` 한 줄로 보정했다. 새 기능/레이아웃 변경 없이 복구 메뉴가 실제 hit-test 가능한지 검사했다.

mock reconcile도 nonarchived private fixed_period 생성을 복구하고 archived early return은 유지했다.

## 7. Source와 history 정리

- 기존 `20261001120000_class_lifecycle_v1.sql`은 Production history에 **없음**을 읽기 전용 확인했다.
- 기존 기본 로컬 DB `supabase_db_first-class-mvp/postgres`에는 `20261001120000`이 적용되어 있다.
- 기존 파일은 내용 그대로 `docs/sql/archive/20261001120000_class_lifecycle_v1_local_only.sql`로 보관했다.
  SHA256: `d7f2000e07640c6ca6ddaba0bb5ad11e770bf5ab29e6ddfd2608b93dc3886800`.
- 기존 기본 로컬 DB의 schema/history/fixtures를 수정·rename·repair하지 않았다. 이 DB는 이전 단일 migration을 적용한 역사적 검수 환경으로 남긴다.
- 활성 source는 새 버전 `20261001130000` COMPAT → `20261001131000` HARDENING이다. 기존 로컬 history를 새 COMPAT가 적용된 것처럼 바꾸지 않는다.
- 새 임시 DB에서 Production schema snapshot을 복원한 뒤 새 두 버전을 순서대로 실제 적용하고 해당 history를 기록했다.
- 기존 로컬 DB를 source와 동기화하려고 `migration repair`, reset, bulk push를 수행하지 않는다. 새 sequence 검증은 임시 DB가 담당한다.
- 작업 전부터 Production-only history `20260929100000`(send_parent_feedback_reminder_alimtalk)이 존재한다. 이번 범위에서 이 별도 migration을 수정·복제하지 않았다.

**다음 Production 적용 때 두 pending 파일을 한 번에 적용하는 `db push`를 사용하지 않는다.** 승인된 COMPAT 파일/버전 하나만 적용하고, HARDENING은 신 앱 READY 이후 별도 적용한다. 전체 migration history 정합성은 clean integration 단계에서 함께 검토한다.

## 8. Clean rehearsal

Production에서 **schema-only** dump를 읽어 새 로컬 DB에 복원했다. 운영 데이터는 복사하지 않았다.
순서: Production schema → 기준 동작 검증 → COMPAT → 구 앱 회귀 → 신 앱 조회/RPC → HARDENING → 최종 계약/기존 Rolling 회귀.

A. COMPAT에서 구 앱의 schedule DELETE → classes direct DELETE PASS.
B. 비공개 fixed_period의 7일 occurrence(날짜/시각/정원/상태)가 기준과 완전히 동일.
C. COMPAT 후 새 컬럼 조회 가능. 기존 fixture rows는 새 NULL 컬럼 외에 동일.
D. COMPAT의 인증된 Studio eligibility/archive/restore/permanent-delete RPC PASS.
E. COMPAT에서 실제 adapter projection의 컬럼 조회와 authenticated eligibility RPC를 실행한 결과로 실제 `StudioClassesManager`/CSS를 렌더했다. 필터, 메뉴, 삭제 가능/불가 표시, 브라우저 오류 없음. UI 검증 중 mutation 0회.
F. HARDENING 후 raw DELETE FAIL.
G. HARDENING 후 RPC empty/generated-only 삭제 PASS, 신청 이력 존재 시 FAIL.
H. archived rolling/fixed reconcile/refill 결과 0, 수동 신규 일정/신청 차단, 이력 보존.
I. HARDENING 후 nonarchived private fixed_period occurrence도 기준과 동일.

COMPAT 전후 기존 public/app 함수의 **정의와 ACL**, 기존 trigger, RLS 정책, table grants를 비교해 동일함을 검증했다.

UI 검증은 schema-only 임시 DB의 SQL 결과를 실제 목록 컴포넌트에 전달하는 로컬 render 검증이다. Production Auth/기존 사용자 세션을 이용한 end-to-end QA로 표현하지 않는다. 그 단계는 COMPAT Production 승인 후 수행한다.

## 9. Verifier와 산출물

```sh
# 읽기 전용 schema snapshot. 운영 데이터 없음.
supabase db dump --linked --schema public,app,auth,storage,extensions \
  --file /tmp/lifecycle-compat-rehearsal/production-schema.sql

node scripts/verify-class-lifecycle-compat.cjs
# 환경의 기존 설치 경로를 지정해 실행 가능. 저장소 dependency 추가 없음.
ESBUILD_MODULE_PATH=/path/to/esbuild PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
  node scripts/verify-class-lifecycle-compat-ui.cjs
npx tsx scripts/verify-rolling-schedules.ts
npx tsx scripts/verify-class-lifecycle.ts
npm run typecheck
npm run lint
git diff --check
```

- `verify-class-lifecycle-compat.sql`: 기준/COMPAT/HARDENING 각 phase의 실제 SQL contract 검사.
- 기존 `verify-rolling-schedules.sql`의 A–N 및 authenticated 권한 검증도 최종 HARDENING DB에서 PASS.
- `/tmp/lifecycle-compat-rehearsal/results.json`: 순서 검증, exact occurrence, 적용 버전 결과.
- 같은 디렉터리 `ui-results.json`, `compat-list.png`, `compat-private-menu.png`, `compat-archived-menu.png`.
- `database.json`: 최종 임시 DB 이름. 기존 기본 로컬 DB는 변경하지 않는다.
- SQL 권한 검증 세션은 기존 로컬 확장 충돌을 피하기 위해 supabase_admin + 빈 session_preload_libraries를 사용한다. Production 확장 조합 검증과 구분한다.

## 10–12. 경계와 다음 순서

Production schema/data migration/write 없음. commit/push/deploy 없음. 기존 working tree reset/clean 없음.
현재 localhost:3000의 Production Supabase/Auth 연결 및 사용자 서버를 바꾸지 않았다.
따라서 **Production에 COMPAT를 아직 적용하지 않은 현재 localhost 목록 오류는 계속될 수 있다.** 이를 해결했다고 보고하지 않는다.

다음 승인 단계:

1. **COMPAT `20261001130000`만** Production 적용.
2. localhost Production 연결 + 사용자 기존 Studio 계정으로 read-only 시각 검수. 실제 lifecycle 상태 변경 금지.
3. clean integration 및 main 반영.
4. 신 Production 앱 READY 확인 및 비파괴 smoke.
5. 별도 HARDENING `20261001131000` 적용.
6. schema/권한/화면 smoke, 최종 lifecycle 사용 시작.

CLASS LIFECYCLE V1 COMPATIBILITY FIXED
READY FOR COMPAT PRODUCTION APPLY
