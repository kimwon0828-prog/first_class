# QC 2 — 신청관리 결과 탭과 운영 정렬

2026-10-05, 기준 main/Production `1cf0f9a0caed58dcc978098c78e3f8ff9c40097c`.

## 확인한 원인

- 실제 route는 `/cases` → `getStudioCases` → 조직 제한 `studio_trial_applications`다. 일반 학원 로그인/RLS로 38건을 읽었다. 체험 완료 후 `registration_status=pending` 2건은 저장되어 있었지만 완료/종료 전체 조건이 등록/미등록 + 결과 기록 + 발행 리포트를 요구했고 고민중 필터도 없었다. 저장 실패가 아닌 조회 조건 누락이다.
- 기존 전체 조건은 결과 하위 탭과도 달랐다. 운영 조회에서 전체 20건, 등록 완료 6건, 미등록 5건, 취소 19건이었다.
- 진행 중은 접수 최신순, 완료/종료는 체험 완료 최신순이었다. 결과 처리 시각과 무관했고 25건 DB pagination이 먼저 적용됐다.
- 신청 진행 `new → reviewing → confirmed → completed`와 등록 결과 `undecided/pending/enrolled/not_enrolled`는 별도 계약이다. 상태 변경, 결과 저장, 상담 재오픈 action과 adapter를 확인했으며 변경하지 않았다.

## 포함 조건과 정렬

- 완료/종료 순서: 전체 → 고민중 → 등록 완료 → 미등록 → 취소 → 노쇼.
- 고민중: 취소·노쇼가 아닌 `completed + pending`만 포함한다. null/undecided/new/reviewing은 고민중으로 추론하지 않는다.
- 전체는 결과 하위 탭의 합집합이다. 등록 완료/미등록은 기존 하위 탭 계약을 유지한다. 취소는 노쇼를 제외하며 노쇼가 우선한다.
- 진행 중의 남은 업무 판정은 유지한다. 결과가 있어도 기록/리포트 업무가 남으면 진행 중에도 나타날 수 있다.
- 진행 중: 확정 대기(new/reviewing/확정 일정 없는 confirmed), 확정된 체험, 기존 체험 후 남은 업무 순. 앞 두 그룹은 확정 block/확정 시각/희망 시각의 유효한 값을 사용해 예정순, 접수 오래된 순. 예정 없는 행은 그룹 끝에 남긴다. 체험 후 업무 그룹은 기존 접수 최신순을 유지한다.
- 고민중: 도래한 `next_contact_at` 먼저, 연락 시각 오래된 순, `completed_at` 오래된 순. 나머지는 체험 완료 오래된 순. 완료일이 없으면 접수순, null은 뒤로 간다. timestamptz의 절대 시각으로 비교하므로 KST와 UTC 표현이 동일하다. 날짜 문자열과 schedule 시간 문자열을 직접 비교하지 않는다.
- 전체 및 다른 결과 탭: 아래 실제 결과 시각 최신순. 동률은 ID로 고정한다. 모든 정렬을 필터링된 전체 대상에 적용한 뒤 25건씩 나눈다.

## 결과 시각의 원천과 한계

- 등록/미등록: 현재 유효한 불변 `registration_results.resolved_at` → 해당 결과로 바뀐 명시적 `registration_result_saved` JSON 로그 → `enrolled_at`/`lost_at` 순.
- 고민중: `before.status != after.status`인 명시적 고민중 전환 로그만 사용한다. 동일 상태 메모 수정과 연락 기록은 시각을 바꾸지 않는다.
- 취소: `canceled_at` → 취소 상태 전환 로그. 노쇼: `no_show_at`.
- 운영 고민중 2건 중 1건에는 명시적 전환 로그가 있고, 과거 1건은 일반 문구뿐이어서 전환 시각을 입증할 수 없다. 이런 행은 전체 정렬에서 `completed_at` → `created_at`으로 대체하되 화면에는 **처리일 미기록**을 표시한다. 결과 처리일을 확인한 것처럼 표시하지 않는다.
- `updated_at`/`last_activity_at`/최근 연락 시각은 결과 정렬에 사용하지 않는다.

## 필터·권한·갱신

- 현재 `/cases`에는 view/filter/q/page만 있으며 기간·담당자 필터는 없다. 임의 접수 기간 제한을 추가하지 않았고 별도 legacy `/applications` 필터도 변경하지 않았다.
- 검색·조직 조건을 먼저 적용한다. 동일 cohort에서 건수와 목록을 계산한다. DB의 응답 제한이 500보다 작아도 실제 수신 개수로 다음 범위를 읽고 exact count 누락/부분 읽기는 오류 처리한다.
- 계산 정렬을 위해 일치하는 전체 신청과 결과 이력을 서버에서 읽는다. 이력은 100개 신청 ID 단위로 묶고 페이지를 모두 읽는다. 규모에 비례한 조회 비용은 남는다. DB 정렬용 schema 변경 없이 전체 정렬 정확성을 지키는 방식이다.
- 결과 이력은 이미 조직/RLS 경계로 읽은 신청 ID만 조회한다. 기존 일반 로그인 client와 권한을 유지한다. 탭 이동 URL/페이지 초기화와 상세 returnTo, 기존 action revalidation을 보존한다.
- migration, 데이터 rewrite, 실제 신청 상태/연락일 수정, 서비스 역할 우회, 외부 알림 발송 없음. Push/MOBILE 설정 변경 없음.

## 검증

- `verify-cases-qc2-order.ts`: 상태 분리, 확정 대기/일정/접수 tie-breaker, 도래/미도래/null 연락일, KST 날짜 경계, 불변 결과/전환 로그, 과거 fallback, 연락 수정 후 순서 유지.
- `verify-cases-qc2-query.cjs`: 실제 query를 안전한 메모리 PostgREST fixture로 실행. 서버 최대 응답 7건, 25건 초과 페이지, 전체 정렬, 탭 합집합/건수, 검색, 타 학원 제외, 누락 시각/이력 오류, 페이지 범위 초과 검증. DB mutation 없음.
- `verify-cases-workflow-browser.cjs`: 실제 route/component/CSS와 실제 query fixture 결과로 1440/1280/1024px 탭/건수/정렬/페이지/검색/상세 URL 및 returnTo, label 줄바꿈·잘림, 빈/에러/재시도/키보드 검증.
- 운영 데이터를 수정한 query를 통해 읽은 결과: 진행 중 18건 유지, 완료/종료 32건 = 고민중 2 + 등록 완료 6 + 미등록 5 + 취소 19 + 노쇼 0. 타 조직 0, 모든 페이지 ID 중복 없음. 개인정보를 이 문서에 기록하지 않는다.
- 기존 `verify-cases-workflow-query.cjs`의 로컬 DB fixture 기대값도 새 계약에 맞췄다. 이 mutation verifier는 Production에서 실행하지 않는다. 대신 위 실제 query fixture와 일반 로그인 읽기 검증을 사용한다.
- QC 1 dashboard verifier 통과. QC 1의 실제 신규 접수 후 운영 노출은 여전히 관측 대기이며 이번 작업의 fixture 통과로 대체하지 않는다.
- typecheck/lint/build/diff 및 관련 verifier, 배포 후 운영 화면/HTTP/runtime 확인 결과는 작업 인수인계에 기록한다.
