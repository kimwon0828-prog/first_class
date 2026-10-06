# 신규 예약 마감의 공개 과정 범위

기준 main/Production: `47e5ed7cb1c3a08f0232e25fcf3071f5ad322d51`.

원인은 기본 시간 목록만 공개 여부로 걸렀지만, preview와 v1 mutation에서 `class_id=null`을 학원 전체로 처리한 것이다. 정상 Studio 로그인으로 2026-10-07 18~19시를 읽으면 공개 1회차와 비공개 3회차가 영향 대상이었다. 운영 데이터는 변경하지 않았다.

## 계약과 호출

`/studio/schedule` → 상단/날짜 숫자의 공통 `BookingTimeDialog` → action → normal authenticated adapter → v2 RPC. 공개 기준은 기존 `is_active=true AND archived_at IS NULL`이다. 신규 마감 선택·미리보기는 공개 과정을 사용하고, 특정 과정 선택은 그 과정으로 제한한다. 비공개 기존 예약과 저장된 마감은 원본 day 데이터에 유지한다.

‘전체 공개 과정’은 선택 시간과 겹치는 공개 과정들의 **과정별 overlay**를 한 트랜잭션에서 저장한다. 창에서 고른 시간 범위 자체를 저장하며, 다른 길이의 회차는 `[start,end)` 겹침으로 영향을 계산한다. `class_id=null`은 새 앱의 신규 마감에 사용하지 않는다. 나중에 공개되는 다른 과정에는 이 마감이 추가되지 않는다. 같은 과정의 rolling 재생성에는 날짜별 overlay가 유지된다.

서버는 로그인 학원, 실제 source keys, 선택 과정, 현재 공개 상태를 검증한다. academy exclusive advisory → ID순 class row lock 계약을 유지한다. 한 snapshot의 전체 대상을 UI expectedTargets와 비교하고 달라지면 전체를 거절한다. 표시 이후 공개·비공개 전환으로 범위가 확대/축소되어도 조용히 저장하지 않는다. 공개 여부/회차를 다시 불러온 후 사용자가 선택·영향을 확인한다. 일부 DB 실패는 전체 rollback, 동일 활성 class/date/window는 기존 unique index로 중복 효과를 막는다.

## COMPAT → APP READY

`20261006160000_public_booking_closure_scope_compat.sql`은 nullable `selection_scope` 컬럼과 v2 읽기/변경 RPC만 추가한다. 기존 행은 null을 유지한다. COMPAT에서 v1 함수·Parent index 조회·최종 신청 INSERT/시간 재배정 guard·RLS·rolling을 변경하지 않는다. 기존 클라이언트는 COMPAT 동안 v1을 계속 사용할 수 있다.

`20261006161000_public_booking_closure_scope_app_ready.sql`은 앱 READY 후 v1의 close만 v2로 연결한다. 구버전/직접 호출의 비공개 포함 예상 대상은 전체 거절하며, 기존 v1 release 코드와 권한은 그대로 유지한다. 새 요청으로 class_id=null을 저장하는 구버전 경로도 막는다.

신규 전체 공개 과정에서 만든 기록에는 `selection_scope=public`, 특정 과정 기록에는 `class`를 저장한다. 기존 `class_id=null`은 ‘기존 학원 전체 마감’으로 표시하며 종전의 비공개 포함 효과를 유지한다. 기존 과정별 기록은 재분류하지 않는다. 같은 활성 범위가 이미 존재하면 기존 기록/사유/출처를 덮어쓰지 않는다.

해제는 공개 여부와 무관한 explicit closure-ID 기반이다. 전체 선택에서는 기존 모든 기록을 확인할 수 있고, 특정 과정에서는 해당 과정 기록을 해제한다. 각 저장 기록의 class 범위로 영향 대상을 계산한다. orphan/비공개 기록도 해제하며, 선택한 기록 이외의 마감·만석·기본 마감·24시간 제한은 유지한다. 기존 학원 전체 마감 해제는 전체 공개 과정 선택 화면에서 제공한다.

Parent는 기존 overlay 판정으로 과정별 신규 마감을 반영한다. 공개 index-only 시간 조회와 최종 신청 저장 guard가 동일한 overlay를 검사한다. 내부 사유나 마감 행은 Parent에 노출하지 않는다. 기존 예약의 같은 시간 확정/배정 보존 계약은 변경하지 않는다.

## 집중 검증

- `verify-date-booking-closures.ts`, `verify-studio-schedule-visibility.ts`: 공개/특정 scope, reported private 3회차, legacy release 범위, half-open/KST/기존 표시 계약.
- `verify-public-booking-closure-scope-db.cjs`: schema/ACL/운영 guard 정의를 복제한 disposable PostgreSQL. 공개 피아노 18~19와 private 17:30~18:30/18~19/18:30~19:30, 공개 offset 두 회차, 날짜/학원/종료 경계, 최신 공개 상태 변화, 원자적 실패·재시도, legacy/global/private/orphan 해제, 예약 fingerprint, Parent 조회와 실제 최종 INSERT, 위조 ID/RLS, 기존 제한, 양방향 신청 race, rolling을 검증한다.
- `verify-date-booking-closures-adapter.cjs`: 실제 Supabase adapter + isolated JWT/PostgREST에서 신규 RPC, Parent 시간 제외/stale INSERT 거절/해제 후 신청 저장/사유 비노출/타학원 거절.
- `verify-public-booking-closure-scope-browser.cjs`: 실제 schedule route/컴포넌트/CSS와 isolated v2 RPC bridge. 상단·날짜 숫자·과정 변경, 공개 대상과 저장 과정 일치, 실패/중복 클릭, 기존 private 예약 상세와 private 저장 기록 해제, 일/주/월, 1440/1280/1024, 키보드. 운영 고객 데이터나 외부 알림을 사용하지 않는다.

Production에서는 COMPAT 보존 검사와 정상 학원 권한 읽기, 미리보기/진입/UI/runtime만 확인한다. 실제 마감·해제 변경 E2E와 QC 1 실제 신규 접수 후 대시보드 노출 관측은 대기로 유지한다. Push/MOBILE/기본 시간표/다른 QC는 변경하지 않는다.
