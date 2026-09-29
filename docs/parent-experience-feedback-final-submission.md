# Parent Experience Feedback V1 — 최종 1회 제출

> 현재 화면·열람/알림 정책은 [Report-first 최종 흐름](parent-report-feedback-flow.md)을 따른다. 아래 문서는 해당 단계의 구현 이력이다. 신규 적용에는 0930 migration까지 필요하다.

2026-09-29. 로컬 구현/검증만. Production write/migration, Git commit/push/PR/main, Vercel 배포 없음.

## 확인한 기존 경로와 Production READ-ONLY

Production 환경의 PostgREST를 GET/HEAD만 허용하는 fetch wrapper로 조사했다. 2026-09-29 06:05 UTC 기준 ParentDecision 전체 3건(현재 2건: planned 1, considering 1; 과거 1건). 현재 declined/옛 날짜 형식은 0건. Feedback 테이블 조회는 404/PGRST205로 아직 미적용이다. 개인 이름/연락처/의견 원문은 수집하거나 보고하지 않았다.

코드의 기존 쓰기는 Record → ParentDecisionForm → setParentDecisionAction → adapter → set_parent_decision RPC 3개 overload → internal이었다. Feedback은 별도 action → save_parent_experience_feedback upsert였다. 이 두 Parent 경로는 폐쇄했다. 이전 action/adapter 메서드는 stale caller를 위해 명시적으로 거부한다. DB에서도 세 overload·internal·기존 Feedback RPC의 authenticated/anon/PUBLIC EXECUTE를 거둔다.

ParentDecision 읽기는 Record 상세/목록 신호/Home/Notifications 및 Studio 상세·전환 분석에서 쓰인다. 현재 row, superseded_at 이력, 기존 unique index와 DTO는 유지한다. 등록 결과·상담·리포트·SMS 상태를 변경하거나 새로운 의향을 추정하지 않는다. 기존 기록의 parent/신청 소유 불일치는 보완 제출을 거부한다.

Production의 함수 본문·ACL 전체를 직접 SQL로 조회한 것은 아니다. 운영 경로는 저장소 migrations/callers 및 로컬 pg_catalog/JWT로 검증했고, Production은 실제 데이터 건수와 노출 API 경로만 읽었다.

## 최종 정책

하나의 카드, 하나의 form, 맨 아래 `피드백 보내기` 한 개. 등록 의향 선택은 client draft만 바꾼다. 새 제출에는 칩 ≥1 또는 비공개 의견, 등록 의향 1개가 필요하다. declined는 사유, schedule_mismatch는 요일·시작 시간·시간 조건 및 range의 유효한 종료 시간이 필요하다.

단일 server action `submitParentExperienceAction` → 단일 `submit_parent_experience` RPC. Class SHARE → 신청 UPDATE 잠금 순서로 소유·자격·기존 응답을 다시 검사한다. Feedback INSERT 후 기존 Decision validator/internal의 INSERT 분기를 실행한다. 두 번째 검증/저장이 실패하면 전체 statement transaction이 rollback된다. 동시 요청은 잠금 뒤 기존 두 응답을 확인하므로 1개만 성공한다. 기존 Feedback 신청 UNIQUE와 Decision 현재 row UNIQUE는 그대로 쓴다. 새로운 테이블/상태축/최종화 backfill은 없다.

| 시작 상태 | 처리 |
|---|---|
| 둘 다 없음 | 두 응답을 원자적으로 1회 INSERT |
| Decision만 있음 | 기존 의향·사유·옛 날짜/요일·작성자·시각을 읽기 전용으로 보존하고 Feedback만 1회 INSERT |
| Feedback만 있음 | 기존 칩·의견·snapshot·시각을 보존하고 Decision만 1회 INSERT |
| 둘 다 있음 | 완료, 재제출·수정 거부 |
| Decision 이력만 있고 현재 row 없음 | 비정상 운영 상태로 제출 거부, 기록을 자동 재생성하지 않음 |
| 조회 실패 | 실패한 영역을 알리고 다른 영역은 유지; 최종 CTA disabled |

호환 제출 시 이미 있는 영역의 payload를 보내면 덮어쓰기를 시도한 것으로 거부한다. UI는 해당 필드를 보내지 않는다. 기존 Decision이 declined이나 이유가 없더라도 사용자의 과거 선택을 새 규칙으로 부정하거나 임의 보완하지 않는다. 기존 showDecision capability도 유지한다: 등록 결과가 확정되어 수집이 닫혔고 Decision이 없는 경우 새 의향/최종 제출은 불가하다. 기존 Decision이 있으면 등록 결과와 무관하게 Feedback만 보완 가능하다.

완료 후 서버를 다시 읽어 두 결과를 readonly로 표시한다. 성공/중복 응답 뒤에는 stale 입력을 다시 제출하지 못한다. 실패 시 칩·의견·의향·사유·요일·시간 state와 native form 값이 유지되도록 명시적으로 action을 dispatch한다. 오류는 allowlist만 노출하고 private note나 SQL 오류를 로그에 쓰지 않는다.

## 권한·운영 영향

Parent 직접 INSERT/UPDATE/DELETE 권한 없음, 기존 mutable RPC 실행 불가. Academy/Public도 쓰기 불가. 추가 trigger가 authenticated/anon의 Feedback UPDATE/DELETE와 Decision UPDATE/DELETE를 방어한다. 새로운 RPC는 Parent 본인·completed·취소/노쇼 아님·지원 프로그램만 허용한다.

service_role/admin의 기존 유지보수 권한과 기존 Decision/snapshot immutability trigger는 유지한다. 로컬 audit에서 Feedback CHECK가 호출하는 app helper에 service_role EXECUTE가 없어 직접 유지보수가 실패하는 기존 V1 결함을 확인해 `valid_experience_feedback_chips`와 `normalize_experience_feedback_note` 두 helper에만 권한을 부여했다. anon/authenticated에는 주지 않는다. 서비스 역할로 피드백 의견 유지보수와 Decision supersede가 가능한지 별도 테스트했다. 이는 Parent용 수정 경로가 아니다.

피드백 taxonomy, program snapshot, public DTO, CLASS/ACADEMY/BOTH 집계 임계값과 정렬, 비공개 의견 정책, Studio/Public UI는 변경하지 않는다.

## Migration 순서 및 rollback

1. `20260929090000_harden_parent_application_insert.sql` — 기존 신청 위조·profile 권한 상승 방지.
2. `20260929091000_parent_experience_feedback.sql` — Feedback storage, RLS, snapshot/taxonomy/public aggregates.
3. `20260929092000_finalize_parent_experience_submission.sql` — 최종 RPC, 옛 경로 폐쇄, Parent 불변성 방어, 최소 service CHECK 권한.

Production은 아직 적용하지 않았다. 향후 별도 승인 후 세 파일을 하나의 검토된 transaction/deployment 단위로 실행해야 한다. 특히 0910만 적용하여 mutable upsert RPC가 Parent에 노출되는 중간 상태를 운영하지 않는다. 새 UI와 최종 RPC를 함께 반영하고 기존 mutable UI로 되돌리지 않는다. 로컬에는 원래 프로젝트의 loopback Supabase에만 SQL transaction으로 적용했다.

**안전한 정책 rollback**: `docs/sql/manual/rollback_parent_experience_final_submission.sql`. 새 제출 RPC만 제거하고 모든 응답/이력, 옛 RPC 권한 차단, write-once trigger와 보안 보강을 유지한다. 읽기 전용 유지보수 UI와 함께 사용한다. 제출은 fail closed이며 조회는 유지된다. 최종 응답을 다시 수정 가능하게 만들지 않는다. 복구는 0920 재적용이다.

**전체 Feedback 기능 제거**: 기존 `rollback_parent_experience_feedback.sql`은 테이블/응답을 제거하는 파괴적 rollback이다. 데이터 export 및 별도 제거 승인이 필요하며 이번 작업에서는 운영 데이터에 실행하지 않았다. 신규 RPC를 먼저 제거하도록 순서만 갱신했다. 신청 INSERT 보안 보강과 ParentDecision 과거/현재 데이터는 유지한다.

## 검증 실행

로컬 TEST JWT/fixture만 사용하며 fixture credential은 /tmp의 0600 파일에만 둔다.

```sh
node scripts/verify-parent-experience-final-db.cjs
PLAYWRIGHT_MODULE_PATH=/path/to/playwright node scripts/verify-parent-experience-final-browser.cjs
node scripts/verify-parent-experience-feedback-migrations.cjs
npx tsx scripts/verify-parent-experience-final.ts
npx tsx scripts/verify-parent-experience-feedback.ts
npx tsx scripts/verify-parent-decision.ts
npx tsx scripts/verify-parent-followup-feedback.ts
npx tsx scripts/verify-parent-experience-detail.ts
npx tsx scripts/verify-parent-record-design.ts
```

Migration verifier는 별도 테스트 컨테이너의 transaction 안에서 신규 적용·재적용·안전 rollback·전체 feature rollback·재적용을 수행하고 마지막에 모든 테스트 변경을 rollback한다. 원래 신청 데이터를 byte-equivalent JSON으로 비교한다. 이전 mutable V1 전용 browser/DB verifier의 수정 성공 기대값은 현재 정책의 근거로 사용하지 않는다. 현재 정책은 위 final verifier가 담당한다.

## 최종 로컬 결과

- JWT/RLS DB verifier **42 PASS**: 정상 원자 제출, 10회 동시 요청 1회 성공, 늦은 Decision 검증 오류 후 Feedback INSERT rollback, 본인/상태/역할 경계, 모든 구 RPC 폐쇄, 직접 쓰기 차단, 부분 상태와 과거 이력 보존, service 유지보수, 공개 DTO.
- 실제 localhost 배포용 빌드 브라우저 **12 PASS**: CTA 순서·하나의 제출, 선택 시 POST 0건, 모든 draft 보존, 연속 클릭 시 POST 1건, reload 후 readonly, legacy/부분 상태, 명확한 중복 안내, 독립 조회 오류, level_test taxonomy, 390/768 overflow·keyboard/focus, Studio/Public 회귀.
- Public Class/Academy의 실제 HTML 및 RSC에 private note/신청 식별자 canary 없음. 개발 모드에서는 RSC debug 메타데이터의 이전 테스트 route parameter가 잡혔으며, 같은 검증을 `next build` → `next start`에서 다시 실행하여 통과했다. 검수 서버는 이 빌드를 유지한다. 공개 UI/집계 코드는 바꾸지 않았다.
- Migration clean apply/reapply, 안전 rollback, 전체 feature rollback/reapply PASS. 기존 신청과 ParentDecision 전체 이력의 JSON snapshot 유지.
- Workflow regression PASS: 등록 결과 trigger/기존 ParentDecision 의미 유지, 등록 후 최종 응답 변경 차단, 등록 전 선택이 있는 legacy의 Feedback 보완, 의향 수집 종료, cancel/no-show 구분.
- 정적 verifier 6종, typecheck, lint(경고/오류 0), build, `git diff --check` PASS.
- 관련 파일 25개(기존 18 + 신규 7)만 변경. 시작 시 있던 나머지 924개 파일은 hash 동일, 삭제 0. 기존 검수 응답을 삭제하거나 dirty tree를 정리하지 않았다.
