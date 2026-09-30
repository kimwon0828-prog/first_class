# Studio Cases Experience Workflow V2 — Local review

2026-09-30. `/studio/cases`와 sidebar label만 신청 관리로 변경한다. route는 유지한다. Application Detail·Dashboard·Schedule·Parent 화면 및 DB/RPC/migration은 변경하지 않는다.

## 판정

- 진행 상태 / 다음 행동 / 등록 상태를 별도 컬럼으로 표시한다.
- new/reviewing은 신청 접수, 다음 행동은 일정 확정이다. 하위 필터는 new=신청 접수, reviewing=일정 확정 필요로 서로 겹치지 않게 나눈다. 일정 없는 confirmed도 일정 확정 필요로 보낸다.
- confirmed의 실제 시작 시각은 기존 block.start_at → confirmed_slot_at 순서다. 미래면 체험 예정, 시작 이후라도 원장이 완료 처리하기 전에는 일정 확정이다. 다음 행동은 체험 진행이다. 종료 시각만으로 completed를 만들지 않는다.
- 체험 예정 필터는 일정이 있는 confirmed 전체다. 시작/종료가 지났지만 아직 완료 처리하지 않은 신청도 숨기지 않는다. tooltip에 체험 진행·완료 확인이 필요한 신청임을 표시한다.
- 실제 completed 이후 record 없음 → 체험 기록 작성, report 발송 이력 없음 → 리포트 발송, undecided/pending → 등록 결과 확인 순서로 하나만 표시한다.
- record와 report가 모두 처리됐고 enrolled/not_enrolled이면 완료·종료다. 취소/노쇼는 항상 종료다. 등록 결과가 확정됐어도 record/report가 없으면 결과 정리 필요다.
- report는 Phase 1의 발송 1회 계약에 맞춰 **철회된 것을 포함한 기존 발송 이력**이다. 철회 후 재발송 불가능한 신청을 새 발송 업무로 만들지 않는다. 요금제/Parent 연결/legacy 발행 제한은 상세 화면의 기존 정책으로 안내한다.
- 상담 기록, next_contact_at, 담당자 미배정은 Cases workflow 판정에서 제외했다. 상담은 최근 기록 후보로만 읽는다. DB 필드와 상세 상담 기능은 보존한다.
- 최근 기록은 기존 신청/완료/상담/종료 시각과 record 생성/report 발송 시각 중 최신 후보다. 새 history를 생성하지 않는다. 학부모 현재 생각은 등록 상태에 합치지 않는다.

## 조회 / URL

- Cases 전용 helper를 도입했다. 공유 `case-view-model.ts`, `case-list-presentation.ts`는 Dashboard/기존 caller의 계약을 보존한다.
- `studio_trial_applications`의 조직 inner join과 기존 RLS를 그대로 사용한다. record/report를 필요한 ID/시각만 embed하여 **관계 존재 조건을 DB count/range 전에** 적용한다. row별 query 없음.
- 일반 조회는 main + teacher/consultation 두 배치, 검색 시 수업 ID 검색 한 번 추가다. 최대 4회이며 페이지 행 수와 무관하다. 상담 본문·작성자 프로필·next_contact_at을 조회하지 않는다.
- 기존 25건 pagination, 진행 중 신청 최신순, 종료 탭 completed_at 우선 순서를 유지한다. 동률에는 ID를 적용한다.
- 기존 search/view/filter/page 및 상세 returnTo를 보존한다. reviewing 북마크는 schedule_needed로 normalize한다. confirmed/post_trial URL은 유지한다.
- 범위 밖 페이지의 PostgREST PGRST103(416)은 첫 row 범위에서 count만 재확인해 기존 첫 페이지 이동 안내를 표시한다. 잘못된 query/권한 오류는 정상 빈 목록으로 숨기지 않는다.
- 진행 중 필터는 전체/신청 접수/일정 확정 필요/체험 예정/결과 정리 필요다. 선택한 필터의 정확한 전체 건수를 결과 헤더에 표시한다.

## 검증

- typecheck, 정식 lint, build, git diff --check PASS. build는 `/tmp/cases-v2-build`의 소스 복사본에서 수행했고 환경변수 파일을 복사하지 않았다. 원래 dev 서버 cache/로그인은 유지했다.
- 관련 순수 verifier 13개 PASS: Cases V2, case-in-trial filter, Cases V1 기존 helper, Dashboard, Application Detail, trial record modal, registration result, report publication, observations, Studio UX, navigation, trial progress, consultation preference.
- A–L fixture: 기록/발송/결정 전/고민 중/등록/미등록/취소/노쇼/연락 지연을 포함한다. 연락일/상담 유무/미배정 변경은 workflow에 영향이 없다.
- `verify-cases-workflow-query.cjs`: 실제 Local Supabase Auth JWT/PostgREST/RLS로 54개 fixture의 10개 필터를 대조했다. 필터별 합계/전체 건수와 집합이 일치하고 중복이 없다. 31건 검색의 25/6 페이지, 범위 밖 페이지, 4개 검색 필드, 다른 조직 차단 PASS. 추가한 Local new 신청 31건만 삭제했다. 기존 fixture 보존, Production write 없음.
- `verify-cases-workflow-browser.cjs`: 실제 Cases route/CSS/shell을 query 경계에서만 fixture로 대체한다. A–L, 1440/1280/1024, 독립 컬럼, 가로 overflow 없음, 중첩 interactive 없음, 검색/URL/pagination/상세 복귀/focus/empty/error/retry/loading PASS.
- 실제 Production Auth로 로그인된 localhost에서도 1440/1280/1024, 필터/검색 Enter/상세 복귀/빈 상태/범위 밖 페이지 확인. 브라우저 오류 0, 쓰기 요청 0. 별도 fixture UI 검증과 실제 localhost 검증을 구분한다.
- 실제 계정 조회 시 진행 중 19 = 신청 접수 0 + 일정 확정 필요 1 + 체험 예정 1 + 결과 정리 필요 17. 완료·종료 18 = 취소 18 (등록/미등록/노쇼 0). 필터 합계 일치. 운영 데이터이므로 이후 사용자의 변경에 따라 달라질 수 있다.

## 변경 파일

- `app/studio/(dashboard)/cases/page.tsx`
- `app/studio/(dashboard)/cases/page.module.css`
- `app/studio/(dashboard)/cases/loading.tsx`
- `src/features/studio/lib/case-filters.ts`
- `src/features/studio/lib/cases-workflow.ts`
- `src/features/studio/queries/get-studio-cases.ts`
- `src/features/studio/ui/studio-shell.tsx` (메뉴 label 한 곳)
- `scripts/fixtures/cases-workflow-v2.ts`
- `scripts/verify-cases-workflow-v2.ts`
- `scripts/verify-cases-workflow-query.cjs`
- `scripts/verify-cases-workflow-browser.cjs`
- `scripts/verify-case-in-trial-filter.ts` (새 필터 계약 기대값)
- 이 문서

검수: http://localhost:3000/studio/cases

증거: `/tmp/cases-v2-ui`, `/tmp/cases-v2-query`, `/tmp/cases-v2-live-results.json`, `/tmp/cases-v2-live-{active,closed}-{1440,1280,1024}.png`. 원본 backup/fingerprint: `/var/folders/vs/w6ngmhxs3xg_fl4r7b5q4zzw0000gn/T/cases-workflow-v2-koy_sakh`.

Production DB/Auth/Storage write, migration, git add/commit/push/deploy 없음. 기존 dirty/untracked와 환경변수는 이번 파일의 수정 범위 밖에서 그대로 보존한다.

## 완료·종료 결과 요약 보완 — 2026-09-30

- 완료·종료의 네 번째 컬럼만 `결과 요약`으로 변경했다. 진행 중의 다음 행동 및 workflow/filter/count/sort 규칙은 그대로다.
- 기존 `registrationReasons` taxonomy 순서로 알려진 ID를 중복 없이 표시한다. 최대 2개의 muted chip과 남은 개수 `+N`; 사유 없으면 `사유 미입력`. 알 수 없는 legacy ID 원문은 노출하지 않는다. 취소/노쇼는 사유보다 우선하고 등록 완료는 간단한 label만 표시한다.
- 주 조회 select에 `registration_reason_ids`만 추가했다. 추가 query/N+1 없음. `registration_note`는 조회·렌더하지 않는다. mutation/action/adapter/RPC/DB 변경 없음.
- 이번 보완의 제품 변경 파일: `app/studio/(dashboard)/cases/page.tsx`, 대응 `page.module.css`, `src/features/studio/lib/cases-workflow.ts`, `src/features/studio/queries/get-studio-cases.ts`.
- 검증 파일: `scripts/fixtures/cases-workflow-v2.ts`, `scripts/verify-cases-workflow-browser.cjs`, `scripts/verify-cases-workflow-query.cjs`, 신규 `scripts/verify-cases-result-summary.ts`, 이 문서.
- typecheck/lint/build/diff-check PASS. build는 환경변수 파일을 제외한 `/tmp/cases-summary-build` 소스 복사본에서 수행해 원래 localhost cache를 보존했다.
- 관련 순수 verifier 14개 PASS (기존 13개 + result summary). Local Auth JWT/RLS 실제 query의 10개 필터/count/partition, reason IDs 매핑, 검색 4필드, 25+6 pagination, 범위 밖 페이지, 타 조직 차단 PASS. 검증에서 생성한 31개 Local 임시 신청만 삭제했고 기존 fixture는 보존했다.
- 실제 route/CSS/shell browser fixture: A–I(사유 1/2/4/없음, note 비노출, 등록/취소/노쇼, 진행 중 유지) PASS. 1440/1280/1024 가로 넘침 없음. desktop row 82px 이하, 사유 4개도 2개와 +2만 렌더. 키보드 focus/검색/페이지/복귀/오류/빈 상태/로딩 회귀 PASS.
- 실제 인증 localhost read smoke PASS. 조회 당시 진행 중 17 = 체험 예정 1 + 결과 정리 필요 16, 완료·종료 20 = 미등록 1 + 취소 19. 기존 기록 당시와 다른 것은 사용자 운영 데이터 변화이며 이번 작업의 write는 없다. 미등록 1건의 기존 taxonomy 사유가 chip으로 표시되는 것을 DOM과 screenshot에서 확인했다. 브라우저 오류 0, 쓰기 요청 0.
- 증거: `/tmp/cases-summary-ui`, `/tmp/cases-summary-query`, `/tmp/cases-summary-live-results.json`, `/tmp/cases-summary-live-not-enrolled.png`, `/tmp/cases-summary-final-smoke.json`, `/tmp/cases-summary-build.log`.
- 작업 직전 backup/fingerprint: `/var/folders/vs/w6ngmhxs3xg_fl4r7b5q4zzw0000gn/T/cases-result-summary-pkdliuvg`. 기존 dirty/untracked·branch/HEAD/staged·env 보존. Application Detail/Dashboard/Parent 수정 없음. Production write/migration/commit/push/deploy 없음.

최종 검수: http://localhost:3000/studio/cases?view=closed&filter=not_enrolled

## 등록 상태 필터 독립 — 2026-09-30 (현재 계약)

이 항목이 위의 기존 “완료·종료 하위 필터 합계 = 전체” 검증 계약을 대체한다. 업무 분류와 등록 결과는 독립 축이다.

- 원인: `getCaseFilterPredicate`의 enrolled/not_enrolled 분기에서 `finished`(completed + record 존재 + report 존재)를 함께 적용해 미발송·미작성 신청을 누락했다.
- 수정: 두 등록 상태 필터는 기존 terminal 제외(`no_show_at`/`canceled_at` 없음, canceled 아님) + `registration_status`만 본다. 체험 상태·기록·리포트·workflow 완료를 추가 요구하지 않는다. 취소/노쇼 제외는 요청의 H/I fixture 계약을 따른다.
- 진행 중/결과 정리 필요 및 완료·종료 전체·취소·노쇼 predicate는 변경하지 않았다. 미등록/등록 완료 하위 필터는 업무 완료 탭의 전체보다 넓을 수 있고, 하위 필터 합계가 전체와 같을 필요가 없다.
- 기록/리포트 업무가 남은 등록 확정 신청은 진행 중 > 결과 정리 필요와 완료·종료 > 해당 등록 상태에서 의도적으로 중복 조회된다. 각 단일 필터의 페이지 내부/페이지 간 중복은 금지한다.
- 기존 query가 이 predicate를 DB exact count/range보다 먼저 적용한다. query/adapter/URL/save 계약 변경, N+1 없음. 기존 UI에는 별도 chip 숫자가 없으며 결과 헤더·하단 total·pagination이 동일한 필터 count를 사용한다.
- 결과 요약의 최대 2개 chip + N, 사유 미입력, 메모 비노출은 유지한다. 남은 업무가 있으면 같은 셀 아래에 작은 `리포트 발송`/`체험 기록 작성` 등을 기존 next-action 판정으로 표시한다.
- 제품 수정 3개: `src/features/studio/lib/case-filters.ts`, `app/studio/(dashboard)/cases/page.tsx`, 대응 CSS. 검증/문서 5개: 기존 fixture, query verifier, browser verifier, 신규 `scripts/verify-cases-registration-filters.ts`, 이 문서.
- typecheck/lint/build/git diff --check PASS. 순수 verifier 15개 PASS (이전 14개 + registration filters). A–I: 완료/미발송/미작성 미등록 포함, 업무 필터와 중복, 등록 완료 미발송 포함, pending/undecided/canceled/no-show 제외.
- 실제 Local Auth JWT/RLS query PASS: 10개 필터별 count/ID 집합, 4개 검색 필드, new/not_enrolled/enrolled 각각 31건 검색의 25+6 페이지, 범위 밖 페이지의 exact count, active post_trial 중복, 다른 조직 차단. 31개 신규 Local 신청을 재사용했다. 등록 상태 전환 trigger가 만든 `registration_results` 종속 행으로 최초 cleanup이 실패해 해당 실행의 신규 ID 31개만 추적하여 종속 행→신청 순으로 정리했다. verifier cleanup을 같은 순서로 고친 뒤 재실행 PASS. 기존 fixture 및 Production 데이터 변경 없음.
- 실제 route/CSS/shell browser: A–I와 결과 요약, 1440/1280/1024 overflow 없음, 등록 상태별 count/업무 표시, filter 변경 page reset, 검색/pagination/returnTo/focus/빈 상태/오류/로딩 PASS.
- 실제 인증 localhost: active 전체 17 / 결과 정리 필요 16 / 체험 예정 1 유지. closed 전체 20 유지. 미등록 **5**(기존 1; 추가 4건은 업무 미완료), 등록 완료 **6**(기존 0; 6건 업무 미완료), 취소 19, 노쇼 0. active+closed 전체 37건의 등록 결과와 각 등록 필터 ID 집합이 정확히 일치한다. 페이지 결과 수/표시 total 일치, 검색·범위 밖 페이지·상세 복귀 PASS. 브라우저 오류 0, 쓰기 요청 0. 조회 시점 수치이며 사용자의 운영 변경에 따라 달라질 수 있다.
- build는 env를 제외한 `/tmp/cases-registration-build` 소스 복사본에서 수행했다. 원래 localhost 서버/Production Supabase Auth 연결을 유지하고 임시 build 디렉터리는 정리했다.
- 증거: `/tmp/cases-registration-ui`, `/tmp/cases-registration-query`, `/tmp/cases-registration-live-results.json`, `/tmp/cases-registration-live-not_enrolled-1440.png`, `/tmp/cases-registration-build.log`.
- 작업 직전 백업/지문: `/var/folders/vs/w6ngmhxs3xg_fl4r7b5q4zzw0000gn/T/cases-registration-filters-9hhdreao`. 다른 dirty/untracked, 환경변수, branch/HEAD/staged 보존. Application Detail/Dashboard/DB/migration/RPC 변경 및 Production write/commit/push/deploy 없음.

검수 화면 유지: http://localhost:3000/studio/cases?view=closed&filter=not_enrolled
