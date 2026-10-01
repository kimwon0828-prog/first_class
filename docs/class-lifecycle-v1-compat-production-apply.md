# Class Lifecycle COMPAT Production 적용 기록

2026-10-01. 사용자 승인 범위: Production `vfkfpekfwrjjocltqbty`에 `20261001130000`만 적용.

## 적용 결과

- `20261001130000_class_lifecycle_v1_compat.sql` 적용 완료. 원본 SHA256: `3e9fc474ca43bfce955e4af8e6b0669f1828fa4616b2e940fad912eeaeda35c7`.
- 적용 직전 history와 신규 객체 부재 확인 후, COMPAT SQL과 해당 migration history 한 건을 동일 transaction으로 적용했다. 중복 실행 및 bulk `db push` 없음.
- 최신 history: `20260930110000` → `20260930111000` → `20261001130000`. 기존 history 전체 보존. 기존 remote-only `20260929100000`도 그대로 유지.
- `20261001131000` HARDENING 및 이전 단일 migration `20261001120000`은 Production에 없다. HARDENING의 constraint/guard도 없다.
- `classes.archived_at`: nullable timestamptz, default 없음. 기존 26개 모두 NULL.
- `app.class_has_operating_history(uuid)`: 내부 helper 존재. PUBLIC/anon/authenticated 실행 권한 없음.
- `get_studio_class_delete_eligibility()`, `mutate_studio_class_lifecycle(uuid,text)`: 존재. authenticated 실행 가능, PUBLIC/anon 실행 불가. security definer 및 빈 search_path 확인.

## 데이터 및 기존 앱 호환성

전체 public 테이블 34개의 count와 전체 행 fingerprint가 적용 전후 동일하다. classes fingerprint는 새 `archived_at`만 제외하고 비교했고, 새 컬럼은 별도로 전부 NULL임을 확인했다.

| 테이블 | 전 | 후 |
| --- | ---: | ---: |
| classes | 26 | 26 |
| trial_applications | 62 | 62 |
| class_schedules | 2,134 | 2,134 |
| schedule_blocks | 43 | 43 |
| experience_reports | 5 | 5 |
| consultation_logs | 21 | 21 |
| application_logs | 223 | 223 |
| trial_results | 20 | 20 |
| registration_results | 18 | 18 |
| sms_logs | 200 | 200 |

기존 public/app 함수 정의·ACL, public trigger·RLS·constraint·index·테이블 권한·RLS 활성 상태도 동일하다. 운영 데이터 INSERT/UPDATE/DELETE 또는 lifecycle mutation 호출은 하지 않았다.

## 읽기 전용 검증과 한계

- 기존 Studio 프로필 9개의 사용자 ID를 DB transaction의 JWT claim으로 설정하고 authenticated role에서 실제 adapter 목록 projection과 eligibility RPC를 실행했다. 각 조직의 목록 수와 RPC 결과 수가 일치하고 조직 범위를 벗어난 결과가 없었다. transaction은 read only + rollback. 이는 DB 권한 시뮬레이션이며 실제 브라우저 로그인 검증은 아니다.
- localhost 환경의 실제 publishable key로 PostgREST `classes?select=id,archived_at&limit=0` HTTP 200 확인. 익명 eligibility RPC는 의도대로 401 / 42501.
- Production `https://studio.firstsuup.com/auth/sign-in` 로그인 화면 HTTP 200. Dashboard `/`, Cases `/cases`, Classes `/classes`, Schedule `/schedule`은 비로그인 요청에서 해당 로그인 화면으로 연결됨.
- localhost `/studio/classes`도 비로그인 요청에서 `/studio/sign-in`으로 연결됨. 기존 서버 PID 14076과 Production Supabase/Auth 설정 유지. 서버 재시작/환경 변경 없음.
- 연결된 브라우저가 없어 **기존 계정의 로그인 후 화면, 필터·action·삭제 상태 렌더, browser console/runtime는 이번 실행에서 직접 확인하지 못했다.** 사용자 실제 계정 시각 검수가 남아 있다. 위 HTTP 결과를 인증된 페이지 smoke PASS로 간주하지 않는다.
- 사전 schema-only 리허설과 UI 렌더 결과는 `class-lifecycle-v1-compatibility.md` 참조. 이전 typecheck/lint/build 결과를 유지했으며 이번에는 앱 코드 변경이 없어 재실행하지 않았다. `git diff --check` PASS.

감사 산출물: `/tmp/lifecycle-compat-production/`의 `before.json`, `after.json`, `apply.sql`, `apply.json`, `schema-grants.json`, `read-only-studio-query.json`, `rest-smoke.json`, `http-smoke.json`, `migration-history-after.txt`. 개인정보 행 원문/인증 토큰을 저장하지 않고 aggregate와 schema 메타데이터를 기록했다.

HARDENING 적용, 실제 종료/복구/영구 삭제/공개 전환, commit/push/main 반영/Vercel 배포는 하지 않았다.

CLASS LIFECYCLE COMPAT DEPLOYED

READY FOR REAL ACCOUNT VISUAL REVIEW
