# Studio 일정·예약 시간 관리의 비공개 수업 노출

> 신규 마감의 전체 선택 범위는 이후 [전체 공개 과정 계약](studio-public-booking-closure-scope.md)으로 변경됐다. 아래 학원 전체 저장/영향 설명은 기존 기록과 당시 구현에 대한 이력이다.


기준 main/Production: `bfd43d39beffea83d80f2ce3a4e3c6f888fe4e6a`.

## 원인과 기존 계약

Parent 및 Class Lifecycle의 공개 조건은 `classes.is_active=true AND archived_at IS NULL`이다. 회차의 booking_status, 만석, 24시간 제한은 별도 축이다. 공개 수업의 closed/hidden 회차도 기존 예약 시간 관리의 상태 표시를 유지한다.

실제 `/studio/schedule`은 `listStudioApplications` → `buildStudioScheduleEvents`로 업무 일정을 그린다. 예약 없는 회차를 달력에 그리는 구조가 아니므로 신청 목록과 상세/취소/완료/날짜 불확실 기록을 공개 조건으로 걸러내지 않는다. 기존 `getStudioScheduleCalendar`는 수업 편집의 회차 관리에도 사용되므로 변경하지 않는다.

문제는 과정 필터에 모든 소속 수업을 표시하고, 예약 시간 관리가 과정 공개 정보 없이 RPC의 전체 회차를 그룹화했다는 것이다. RPC는 비공개 수업의 회차를 hidden으로 반환하지만 이것을 공개 여부로 사용하면 공개 수업의 hidden 회차까지 잘못 숨기게 된다.

## 최소 변경

- authenticated Studio class 조회에 기존 `is_active`/`archived_at`을 포함한다. normal client/RLS/organization scope와 exact-count pagination을 유지한다.
- 예약 시간 관리의 day 조회는 원본 회차·마감 배열을 그대로 유지한다. 추가 class metadata와 해당 날짜 신청의 source time 이력 key만 전달한다. 기존 scoped 신청 query를 재사용하고 학생·보호자 정보는 새 payload에 추가하지 않는다.
- 기본 회차 표시는 공개 수업 또는 해당 회차의 기존 예약/신청 이력/마감 기록이 있는 경우다. active 예약 인원은 기존 reservationIds 계약을 그대로 사용한다. 완료/취소 이력 때문에 active 건수를 늘리지 않는다.
- 과정 선택은 표시할 회차 또는 저장된 scoped 마감이 있는 과정을 유지한다. 회차가 사라진 마감도 실제 소속 class title로 선택하고 기존 explicit closure-ID 해제 경로를 사용한다.
- 달력의 과정 필터는 공개 수업 + 현재 업무 일정/마감에서 필요한 과정을 포함한다. 선생님/상태 필터로 기본 접근 옵션을 다시 축소하지 않는다. 마지막 마감 해제 뒤 제거된 과정 선택은 기존 URL filter resolver로 안전하게 처리한다.
- 전체 과정 마감의 preview/expectedTargets/save는 **필터 전 원본 회차**를 사용한다. 숨겨진 비공개 회차도 겹치면 적용 전에 과정·시간을 안내한다. 해제의 기존 예약 보존 안내와 다른 유효 제한은 유지한다.

DB migration, 기존 row/state/마감 rewrite, Parent 조회/최종 저장 guard, rolling 및 기본 시간표 변경 없음. Push/알림 transport/MOBILE/리포트/Admin 변경 없음.

## 검증

`verify-studio-schedule-visibility.ts`: 공개 제한 상태와 비공개 제외, 기존 예약/완료·취소 이력/마감/orphan 접근, full raw 영향 범위, 비변경 helpers, 빈 목록, 기존 상세 href/상태 필터.

`verify-studio-schedule-visibility-browser.cjs`: 실제 schedule route/manager/dialog/CSS를 격리 SQL RPC bridge와 연결한다. 비공개 빈 회차·과정 제외, private booking/history 접근, 공개→비공개 전환 후 마감 기록, orphan 및 scoped 해제, 숨겨진 회차 포함 whole-academy preview/save, full/base/cutoff 상태, 날짜·빈 상태·일/주/월·취소 필터·상세 링크·1440/1280/1024px·기존 예약 fingerprint를 검증한다. Production 연결/알림 전송은 없다.

기존 date-closure DB/edge/actual adapter+JWT+PostgREST/browser verifier로 Parent 최종 저장 거절·RLS·원본 영향 범위·rolling·같은 시간 기존 확정·마감 해제 회귀를 확인한다. 기존 schedule query verifier는 소규모 API row cap을 사용한 pagination, 학원 scope, 상태별 업무 목록을 검사한다. metadata fixture에 실제 공개 필드를 추가했다.

QC 1/QC 2/Lifecycle/Parent/rolling/schedule 관련 verifier와 typecheck/lint/build/diff-check를 실행한다. 운영에서는 읽기와 UI 이동만 수행하며 실제 마감·해제 변경 E2E 및 QC 1 신규 접수 관측은 대기로 유지한다.

## 변경 전 운영 관측

로그인한 학원의 2026-10-07 기준: 원본 회차 23건·16개 시간 그룹·3개 과정, 비공개 회차 14건, 활성 예약 0건, 마감 0건. 정상 학원 권한으로 수정된 adapter를 읽기 실행하면 원본 23건을 유지하고 표시 대상 9건·9개 시간 그룹·1개 과정으로 계산됐다. 해당 날짜에 연결된 추가 신청 이력은 0건이었다. 실제 당시 데이터의 관측이며 구현에 건수를 고정하지 않는다.
