# 첫수업 MVP 구현 계획 (role 정책 반영)

## 0) 전제
- 역할(role)은 `parent | teacher`만 사용한다.
- `operator`는 더 이상 사용하지 않는다.
- `teacher`가 studio 운영 주체 역할을 포함한다.
- 공개 회원가입은 `parent`만 허용한다.
- `teacher` 계정은 초대/수동 생성만 허용한다.
- `classes` 테이블 이름은 유지하고, MVP 프로그램 엔터티로 사용한다.
- MVP 프로그램 유형은 `trial_class`, `level_test` 두 가지만 지원한다.
- 입학고시는 MVP에서 제외하고 후순위 확장으로 미룬다.
- 상태값 전면 개편은 하지 않고, 노쇼/결과/상담/등록 전환은 후속 phase에서 별도 축으로 분리한다.

## 1) 라우트 접근 정책
| 라우트 | 공개 여부 | 대상 | 비고 |
|---|---|---|---|
| `/classes` | 공개 | parent | mobile-first |
| `/classes/[id]` | 공개 | parent | mobile-first |
| `/classes/[id]/apply` | 로그인 필요 | parent | 비로그인 시 `/auth/sign-in` |
| `/my` | 로그인 필요 | parent | 마이페이지 홈 |
| `/my/children` | 로그인 필요 | parent | 자녀 프로필 관리 |
| `/my/applications` | 로그인 필요 | parent | 본인 신청만 |
| `/auth/sign-in` | 공개 | parent/teacher | 가입은 parent 전용 |
| `/auth/sign-up` | 공개 | parent | 공개 회원가입 전용 |
| `/studio/*` | 로그인+권한 필요 | teacher | desktop-first |

### 로그인 후 기본 이동
- parent: `/classes`
- teacher: `/studio`

## 2) Auth/Profile 원칙
- 인증 소스는 `auth.users`, 역할 소스는 `profiles.role`로 유지한다.
- `profiles.id = auth.users.id`를 고정한다.
- 공개 가입 시 생성되는 프로필 role은 항상 `parent`다.
- `teacher`는 초대/수동 생성된 프로필만 로그인 가능하게 유지한다.

## 3) DB/RLS 전환 설계 개요
> 기존 migration 파일은 수정하지 않고, 신규 migration으로 전환한다.

1. 데이터 전환 migration
- 기존 `profiles.role='operator'` 데이터를 `teacher`로 일괄 변환
- 변환 전후 카운트 검증 쿼리 포함

2. 제약 전환 migration
- `profiles_role_check`를 `parent|teacher` 기준으로 교체
- `profiles_role_org_check`는 `parent=null`, `teacher=not null`로 교체

3. RLS 전환 migration
- `*_operator_*` 정책 drop
- teacher 단일 운영 정책으로 재생성
- `/studio` 운영 범위는 teacher 정책으로 통합

## 4) 프로그램 모델 고정
- `classes.program_type`를 신규 migration으로 추가한다.
- 허용값은 `trial_class | level_test`만 사용한다.
- 기존 row는 default `trial_class`로 정리한다.
- `schedule_blocks.class_id`를 기준으로 프로그램별 가능 시간을 연결한다.
- `Phase 7-3` 우선순위는 `program_type` 기준 정리와 class-linked schedule 정합성 확보다.

## 5) Seed 전환 방향
- `seed.sql`에서 `operator` 계정/프로필 생성 구문 제거
- `teacher` 운영 계정 시드만 유지
- 공개 회원가입 시드는 parent만 가정
- `profiles.id = auth.users.id` 구조는 유지하고, auth 계정 선행 준비 절차를 유지

## 6) 구현 순서
1. 문서 정책 반영(roles/flows/routes 통일)
2. auth 타입/redirect/profile-sync에서 role 정책(`parent|teacher`) 정렬
3. `classes.program_type` 최소 migration 반영
4. studio classes/schedule에서 class-linked program 기준 정렬
5. studio 접근 정책을 teacher 기준으로 정렬
6. DB/RLS/seed 전환 migration 설계 확정 후 반영

## 7) 상태 확장 전략
- 현재 신청 상태는 `new | reviewing | confirmed | completed | canceled`를 유지한다.
- `no_show`, `result_entered`, `consultation_needed`, `consultation_completed`, `registered`, `not_registered`는 통합 status에 바로 넣지 않는다.
- 후속 phase에서 `attendance`, `result`, `consultation`, `registration` 축을 별도 컬럼 또는 구조로 분리한다.

## 8) 학부모 마이페이지/자녀 프로필 전략
- `/my`는 보호자 인사, 신청 현황 요약, 최근 신청 내역, 자녀 관리/신청 내역 바로가기를 제공한다.
- `/my/children`는 mobile-first 단일 컬럼 레이아웃으로 자녀 목록 조회, 등록, 수정을 제공한다.
- `children` 테이블을 신규 도입하고 parent 본인 데이터만 RLS로 접근 가능하게 한다.
- `trial_applications.child_id`는 nullable로 추가하되, Phase 8-1에서는 신청 폼 저장에 아직 사용하지 않는다.
- 기존 `trial_applications.child_name`, `child_grade`, `child_school` 등 신청 스냅샷 컬럼은 유지한다.

## 9) DB 전환 적용 후 검증 체크리스트
- role 전환 확인: `profiles.role='operator'`가 0건인지 확인
- 조직 제약 확인: `parent -> organization_id null`, `teacher -> organization_id not null` 위반 0건 확인
- teacher 정합성 확인: `profiles.role='teacher'`인데 `teachers.profile_id` 없는 행이 0건인지 확인
- RLS 확인(parent): 공개 화면/신청/내 신청은 동작, `/studio/*` 데이터 쿼리는 차단되는지 확인
- RLS 확인(teacher): 본인 organization의 `classes/schedule_blocks/trial_applications/application_logs` 접근 가능 확인
- RLS 확인(parent children): 본인 `children`만 조회/등록/수정 가능하고 delete는 허용되지 않는지 확인
- 공개 회원가입 확인: 신규 가입 계정의 `profiles.role`이 항상 `parent`인지 확인
- 회귀 확인: 신청 생성 -> `trial_applications.status='new'` -> `application_logs` 최초 로그 생성 유지 확인
- 프로그램 유형 확인: `classes.program_type`의 null 값이 없고 허용값 외 데이터가 0건인지 확인
- 일정 정합성 확인: parent 신청 화면이 해당 `class_id` 슬롯을 우선 노출하는지 확인
