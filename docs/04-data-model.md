# 데이터 모델 초안

## auth.users
Supabase 기본 인증 사용자 테이블

## profiles
- id (auth.users.id 참조)
- role: parent | teacher
- name
- phone
- organization_id nullable
- created_at

## organizations
- id
- name
- branch_name
- created_at

## teachers
- id
- profile_id
- organization_id
- intro
- specialty
- career_years
- created_at

## classes
- id
- organization_id
- teacher_id
- program_type: trial_class | level_test
- title
- subject
- target_age
- region
- description
- trial_price
- is_active
- created_at

## schedule_blocks
- id
- teacher_id
- class_id nullable
- type: regular | available | blocked | trial_booked
- start_at
- end_at
- related_application_id nullable
- created_at

## trial_applications
- id
- parent_id
- class_id
- child_id nullable
- assigned_teacher_id nullable
- child_name
- child_grade
- requested_slot_at
- confirmed_slot_at nullable
- confirmed_schedule_block_id nullable
- memo
- status: new | reviewing | confirmed | completed | canceled
- created_at

## children
- id
- parent_id
- name
- grade
- school_name nullable
- notes nullable
- current_level nullable
- interest_subjects nullable
- goal_note nullable
- created_at
- updated_at

## application_logs
- id
- application_id
- from_status
- to_status
- actor_id
- note
- created_at

## 모델 메모
- `classes` 테이블 이름은 유지하고, MVP에서는 프로그램 엔터티로 사용한다.
- 프로그램 유형은 `trial_class`(체험수업), `level_test`(레벨테스트)만 지원한다.
- `schedule_blocks.class_id`를 기준으로 프로그램별 예약 가능 시간을 연결한다.
- parent 신청 화면은 해당 `class_id`에 연결된 슬롯을 우선 노출한다.
- `children`는 학부모가 반복 입력 없이 자녀 정보를 재사용하기 위한 프로필 테이블이다.
- `trial_applications`는 신청 시점 스냅샷을 유지하므로 `child_name`, `child_grade`, `child_school` 컬럼은 유지한다.
- `trial_applications.child_id`는 nullable로 두고, 기존 데이터 백필 없이 점진적으로 연결한다.
- `trial_applications.interest_subjects`는 선택한 자녀의 관심 과목을 신청 시점에 보존하는 nullable `text` snapshot이다. 생성 action의 기존 owned-child 조회 결과를 재사용한다. 현재 프로필 live 값이나 수업 과목으로 보완하지 않으며, 기존 신청은 backfill 없이 NULL로 유지하고 Studio에서 행을 숨긴다.
- 관심 과목 snapshot 코드 배포 전 `20260928120000_add_application_interest_subjects_snapshot.sql`을 적용해야 한다. Studio view도 동일 권한/조직 조건으로 갱신하며 Parent 조회 projection은 확장하지 않는다.
- 입학고시는 MVP에서 제외하며, 점수/합격/불합격/재응시 구조는 후속 확장으로 미룬다.
- 노쇼, 결과 기록, 상담, 등록 전환은 현재 `status`에 바로 합치지 않고 후속 phase에서 별도 축으로 분리한다.
