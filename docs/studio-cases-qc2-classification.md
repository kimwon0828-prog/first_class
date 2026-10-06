# QC 2 보완 — 체험 기준 탭 분류와 다음 할 일

2026-10-06. 작업 시작 시 fetch한 main과 Studio Production은 모두 `1c5570d6f03802b209c3fc1b58e5504e2bc6b664`, Vercel READY였다. 아래 분류가 이전 Cases V2/QC 2의 남은 업무 기준 분류를 대체한다. 정렬 원천은 기존 QC 2 계약을 유지한다.

## 로컬·Production 차이의 확인된 원인

- `localhost:3000`의 실제 Next PID cwd는 원래 WEB workspace였다. 그 workspace는 `feat/studio-ux-phase1`, HEAD `02060e7d2fe41e5dd7ac10f403029b5e8193869a`와 기존 dirty/untracked 소스를 사용한다. QC 2는 별도 clean integration worktree에서 main/Production에 반영됐으므로 원래 로컬 소스에는 고민중 탭이 없다.
- 같은 학원 권한으로 로컬/기존 main/수정 query를 읽고 로그인 브라우저 화면도 비교했다. 로컬 완료·종료 필터에는 고민중이 없고 전체 20건, 기존 Production에는 고민중이 있으며 전체 32건이었다. 양쪽 진행 중에는 완료 신청 17건이 포함됐다.
- 완료 신청이 진행 중에 남은 이유는 원래 `unfinished(record/report/registration_status)` 조건과 `workflow.closed = completed && !action`이다. QC 2는 그 업무 분류를 보존했으므로 보고와 제품 기준의 차이가 남았다. 이제 완료 상태와 다음 업무를 분리한다.
- 캡처 시각의 원래 화면을 직접 재현한 것은 아니다. 현재 로컬 실행 소스·화면·운영 query 차이를 확인한 결과다. 원래 localhost 서버와 dirty 소스를 자동 갱신하지 않는다.

## 최종 분류

- 진행 중 전체: 취소·노쇼가 아닌 `new/reviewing/confirmed`.
- 일정 확정 대기: new/reviewing 및 확정 일정 없는 confirmed. 체험 예정·진행: 확정 일정이 있는 confirmed. 시간 경과로 completed를 추론하지 않는다. 시작/종료 표시는 기존 KST/block 우선 `getTrialProgressState`를 사용한다.
- 완료·종료 전체: completed 또는 canceled 또는 기존 취소/노쇼 시각이 있는 신청. 기록·리포트·등록 결과를 진입 조건으로 요구하지 않는다.
- 완료·종료 필터 순서: 전체 / 고민중 / 등록 완료 / 미등록 / 취소 / 노쇼. 결과 필터는 취소·노쇼를 제외한 completed + 기존 registration_status. 고민중은 pending만, null/undecided는 전체에만 포함한다.
- 전체 건수는 결과 하위 탭 합계에 결과 미정 completed를 더한 수다. UI는 선택된 필터의 동일 query count/list/pages를 표시한다. 개별 칩 숫자를 새로 만들지 않는다.
- 이전 `new/reviewing` 필터 URL은 일정 확정 대기로 normalize한다. `post_trial` 북마크는 완료·종료 전체로 연결해 후속 작업을 찾을 수 있다. 검색어와 상세 returnTo를 유지한다.
- 진행 중 안내: “일정 확정부터 체험 진행까지 관리하세요.” 완료·종료 안내: “체험 결과와 등록 여부를 관리하세요.”

## 다음 행동과 실제 제공되는 기능

| 조건 | 다음 할 일 / 이동 영역 |
|---|---|
| new/reviewing | 일정 확정 → 상세 `#confirm-schedule` |
| 확정된 미완료 체험 | 상세 보기 → 기존 상세 체험 처리 화면 |
| 과거 confirmed인데 확정 시각 없음 | 대기 목록에 보존, 상세 보기 → 기존 상세의 일정 확인. 새 일정 변경 기능을 만들지 않음 |
| completed + 체험 기록 없음 | 체험 기록 작성 → `#trial-record` |
| 기록 있음 + 발행 이력 없음 | 리포트 확인 → `#report-publishing-title` |
| 발행 이력 있음 + null/undecided | 등록 결과 입력 → `#registration-result-title` |
| completed + pending | 상담 기록 추가 → `#consultation-records`, 등록 결과 입력 → `#registration-result-title`. 기록/리포트 업무가 남으면 그 링크도 함께 제공 |
| 후속 작업 없음 / 취소 / 노쇼 | 상세 보기 |

- 현재 report는 확정된 `trial_results`에서 공개 필드를 조립하는 미리보기와 불변 발행 snapshot이다. 별도 서버 초안/리포트 작성·이어쓰기 editor가 없고 기록은 1회 확정 후 읽기 전용이다. 따라서 실제 기능과 맞지 않는 작성/이어쓰기 버튼을 만들지 않고 기존 리포트 확인 영역으로 연결한다. 해당 영역의 요금제·legacy·학부모 연결·내용 부족·철회 정책을 유지한다. 초안 저장/수정 기능은 이번 구현·PASS 범위에 포함되지 않는다.
- 모든 행 버튼은 링크다. 이동만으로 상태 변경·기록 저장·상담 추가·리포트 발행을 실행하지 않는다. 상세의 기존 작성/저장 버튼에서 사용자가 별도로 처리한다.
- 전체 행 링크 안에 버튼을 중첩하지 않는다. 학생 이름, 다음 할 일, 상세 화살표가 독립 링크이며 동일 상세 returnTo를 보존한다. 상세에 추가한 기록/상담 anchor ID 외 기능 변경 없음.

## 정렬·데이터 보호

- 확정 대기 우선, 각 그룹은 QC 2의 block/confirmed/requested 일정순 → 접수 오래된 순 → ID. 일정 없는 행은 그룹 뒤에 보존한다.
- 고민중은 도래 연락일 우선·연락일/완료일 오래된 순. 완료·종료 결과는 불변 등록 결과/명시적 전환 로그/취소·노쇼 처리 시각 최신순이다.
- null/undecided에는 실제 최종 결과 시각을 만들지 않는다. 처리 시각 미기록은 완료일→접수일로 정렬하고 “처리일 미기록”을 유지한다. 연락·updated_at·last_activity_at이 결과 순서를 바꾸지 않는다.
- 검색/조직 제한을 먼저 적용하고 전체 정렬 후 25건씩 pagination한다. RLS와 일반 로그인 query를 유지한다. 기존 신청/등록/상담/발행 action 및 revalidation을 수정하지 않는다.
- 데이터 rewrite, 새 DB 상태, migration, 서비스 역할 우회 없음. 자동 이벤트 Push 4종 OFF 설정/MOBILE/Parent/일정 설정 변경 및 외부 알림 발송 없음.

## 읽기 결과와 검증

- 같은 학원의 기존 신청 38건: 수정 전 Production 진행 중 18/완료·종료 32, 수정 후 진행 중 1/완료·종료 37. 상단 탭 중복 0, 누락 0. 고민중 2, 등록 완료 6, 미등록 5, 취소 19, 노쇼 0, 결과 미정 완료 5. 과거 고민중 1건의 전환 시각은 여전히 미기록이다.
- 실제 query를 일반 로그인/RLS로 읽기 비교했다. 타 조직 0, 전체 페이지 중복 없음. 개인정보를 이 문서에 기록하지 않는다.
- `verify-cases-classification.ts`: 기록/발행/결과 20조합, 미래/체험 중/예정 종료 경과 confirmed, null/undecided, 탭/legacy URL/기존 anchor와 다음 행동.
- `verify-cases-qc2-query.cjs`: 실제 query와 읽기 전용 메모리 PostgREST fixture. 응답 상한 7건, 25건 초과 페이지, 상태별 전체 집합 누락/중복 0, 검색/조직/건수/순서/결과 시각/연락 수정/조회 실패 검증.
- `verify-cases-workflow-browser.cjs`: 실제 route/shell/CSS와 query fixture 결과, 1440/1280/1024px 탭/버튼/한글/정렬/페이지/returnTo/키보드/빈 상태/에러/로딩. 네트워크 차단.
- 상세 browser verifier는 baseline에서도 Next hook stub 5개 export 누락으로 실패했다. verifier의 navigation/link stub만 현재 API에 맞췄으며 Parent 제품 코드는 변경하지 않았다.
- 로컬 mutation verifier는 기대값만 새 분류에 맞췄고 Production에서 실행하지 않는다. 고객 신청 변경·리포트 발행 E2E는 fixture와 실제 읽기 관측을 구분한다.
- typecheck/lint/build/diff check, 관련 verifier와 배포 후 Production 화면/버튼/HTTP/runtime 결과는 최종 인수인계에 기록한다.
- QC 1의 실제 신규 접수 후 대시보드 노출은 관측 대기다. QC 1 fixture 회귀 통과가 이 관측을 대체하지 않는다. 다음 QC는 시작하지 않는다.
