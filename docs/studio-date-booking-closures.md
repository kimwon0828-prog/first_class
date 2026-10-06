# 날짜별 예약 시간 마감·해제

> 신규 마감의 전체 선택 범위는 이후 [전체 공개 과정 계약](studio-public-booking-closure-scope.md)으로 변경됐다. 아래 학원 전체 저장/영향 설명은 기존 기록과 당시 구현에 대한 이력이다.


## 계약과 저장 구조

기준 main: `3539816b8c1214b6f1139b4f5d03c2948cece148`.
기존 `class_schedules`의 one_time/legacy weekly 회차, `schedule_blocks`의 available fallback, `class_operating_rules`와 `class_schedule_exceptions`를 추적했다. 기존 booking_status/exception은 원본 회차 상태도 바꾸므로, 다른 제한을 보존하면서 독립적으로 해제해야 하는 날짜별 제한에는 그대로 쓰지 않는다.

`20261006120000_date_booking_closures_compat.sql`은 `date_booking_closures`와 조회/변경 RPC, 신규 예약 검증 trigger만 추가한다. 기존 회차·신청·정원·반복 규칙·정책·함수는 변경하지 않는다. 전체 과정은 class_id=null, 특정 과정은 실제 class_id를 저장한다. 해제는 released_at/by 기록이며 다른 활성 마감이나 기본 마감은 유지한다. 동일 활성 범위는 unique index로 재시도 중복을 방지한다.

시간은 Asia/Seoul로 해석하고 범위는 `[start,end)`다. 13~15시 마감은 12시 종료/15시 시작 및 다른 날짜에 영향을 주지 않는다. 실제 날짜의 source ID를 서버에서 확인한다. 다른 길이/시작 시간의 회차는 겹침으로 계산하고 UI 미리보기의 전체 대상과 서버 대상이 다르면 transaction 전체를 거절한다. 회차가 제거된 뒤에도 저장된 마감에서 제한만 해제할 수 있다.

## 실제 호출과 권한

Studio `/studio/schedule` → `StudioScheduleManager` → `BookingTimeDialog` → `manage-booking-times` action → normal authenticated adapter → scoped RPC. org는 로그인 소속에서 정하며 UI의 org 입력을 신뢰하지 않는다. 자기 학원 teacher/operator만 읽기·변경 가능하고 direct DML은 허용하지 않는다. Parent는 내부 사유와 마감 행을 읽을 수 없다.

Parent 기존 시간 조회 두 경로(class schedule / block fallback)에 공개 index-only RPC를 적용한다. 실패하면 예약 가능 시간 조회가 닫힌다. 기존 예약 인원 aggregate의 서비스 경계는 그대로 유지한다. 신규 권한 우회는 추가하지 않았다.

최종 `trial_applications` INSERT와 실제 class/time 재배정 UPDATE도 DB trigger가 실 source·기본 제한·날짜 마감을 검사한다. class schedule과 함께 block ID가 전달되면 소속·시작·종료가 일치해야 한다. Parent의 기존 24시간/정원 제한도 유지한다. 같은 class/시각으로 기존 신청을 확정·배정하는 흐름은 보존한다. 시간 없는 운영 import 이력도 보존하며 이후 새 시간 지정 시 검사한다. 기존 예약 취소/변경, 리포트 발행, 외부 알림 transport 호출은 없다.

잠금 순서는 신규 예약에서 academy shared advisory → 기존 class row lock → 최종 검증, 마감에서 academy exclusive advisory → ID순 class row lock → 제한 저장이다. 따라서 마감이 먼저 commit되면 신청은 거절되고, 신청이 먼저 저장되면 기존 예약으로 유지된다. 신규 class가 동시에 생겨도 전체 과정 제한을 우회하지 않는다. 기존 same-time confirm은 새 academy lock이 필요 없어 기존 class→application→teacher 순서를 유지한다. 운영 confirm/import 함수 정의도 읽기 확인했다.

rolling 생성은 기존 class 잠금과 규칙을 그대로 사용한다. 별도 overlay는 source 회차 ID에 종속되지 않아 rolling 실행·회차 재생성으로 풀리지 않는다.

## UI

상단 및 날짜의 예약 시간 관리 진입, 일/주/월 보기와 예약 상세·필터를 유지한다. 실제 날짜별 회차를 묶으며 60분 하드코딩은 없다. 선택과 저장은 별개이고 실패 시 선택 유지, 저장 중 중복/닫기 방지, 빈/오류 상태를 제공한다. 전체 과정에서 일부만 마감된 동일 시간은 일부 과정 마감으로 표시한다. 적용 전에 겹치는 과정과 시간, 기존 예약 유지 건수를 표시한다. 저장된 마감 목록은 orphan 회차도 해제 가능하다.

달력에는 회색 범위와 학원 전체/과정 구분을 표시한다. 과정 필터는 일치 범위와 학원 전체를 포함하고 선생님/예약 상태 필터는 마감을 숨기지 않는다. 기존 예약 카드는 별도 영역을 유지한다. 사유는 학원 내부에만 표시한다.

## 재현 가능한 검증

- `verify-date-booking-closures.ts`: half-open 경계, 다른 길이, 전체/특정 과정, partial grouping, 중복 예약 건수, 독립 해제, additive/private 경계.
- `verify-date-booking-closures-db.cjs`: schema+ACL 격리 PostgreSQL에서 실제 RPC/RLS/trigger. fixture만 생성하며 Production 접속 없음. 양쪽 동시 transaction 순서, stale/direct 신청 차단, 기존 예약 fingerprint, rolling 유지 등.
- `verify-date-booking-closures-edges.cjs`: 현재 운영 confirm/phone guard 정의를 격리 DB에 사용. 같은 시간 확정 보존, 직접 변경 권한 거절, 위조 source, 해제 뒤 만석·기본 마감·24시간 제한, weekly/block fallback, 재배정, orphan 해제.
- `verify-date-booking-closures-adapter.cjs`: 실제 Supabase adapter + 격리 PostgREST/JWT. 공개 시간 제외, 내부 사유 미노출, stale 최종 INSERT 거절, 해제 후 실제 fixture 신청 저장, 타 학원 거절.
- `verify-date-booking-closures-browser.cjs`: 실제 schedule route/components/CSS → localhost bridge → 격리 SQL RPC. 네트워크는 bridge만 허용. 실패/중복 클릭/선택/마감/해제/부분 과정, 일·주·월, 기존 예약, 1440/1280/1024px, 키보드 검사.

Node verifier에는 `CLOSURES_DB_FIXTURE`를 지정한다. DB verifier는 `CLOSURES_TEST_DB`로 전용 DB를 명시한다. Docker container `firstsuup-closures-isolated`와 합성 fixture만 사용한다. 브라우저/adapter verifier는 `ESBUILD_MODULE_PATH`와 `PLAYWRIGHT_MODULE_PATH`를 지정할 수 있고 배포 dependency를 추가하지 않는다. 운영 환경변수·Production DB를 테스트 harness에 연결하지 않는다.

QC 1/QC 2 및 schedule/rolling/Parent 관련 verifier와 typecheck/lint/build/diff-check를 함께 확인한다. Production은 COMPAT 먼저, APP READY 이후 로그인 읽기 검증한다. Production의 실제 마감·해제·신규 신청 변경 E2E는 고객 데이터 보호 때문에 수행하지 않는다. QC 1 실제 신규 접수 후 대시보드 노출 관측은 대기로 유지한다.

## 이번 반영 결과

- Production COMPAT version `20261006120000` 적용 완료. 적용 당시 SQL SHA256 `4e697f08ed870559ceac06ad2be31fa28dae873b28d13a3105f7fb69a8361be8`. commit에는 SQL 의미가 같은 trailing whitespace 정리본을 저장한다.
- repeatable-read 트랜잭션에서 기존 public 38개 테이블 전체 행 fingerprint/count, 기존 public/app 함수 및 기존 정책/트리거의 동일성을 검사했다. 새 마감 행은 0건이다. 첫 보존 검사 helper의 alias 오류는 전체 롤백을 확인하고 수정 뒤 재적용했다. 고객 데이터 변화 없음.
- 정상 학원 권한으로 다음 날짜 운영 RPC 읽기: 실제 제공 회차 30건/마감 0건. 위조 org 조회 거절. 해당 시점의 조회이며 건수를 고정하는 구현이 아니다.
- 최종 격리 DB/edges, 실제 adapter+PostgREST/JWT, 실제 컴포넌트 브라우저 변경 E2E 통과. QC 1/2 및 Parent/rolling/schedule 포함 관련 verifier 22개, typecheck/lint/build/diff-check 통과. 기존 실패 0, 최종 신규 실패 0. build의 webpack cache/deprecated next lint 안내는 오류가 아니다.
- Production 마감·해제 변경 E2E와 실제 신규 접수는 미수행이며 fixture/격리 관측과 구분한다.
