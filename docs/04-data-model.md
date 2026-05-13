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
- type: regular | available | blocked | trial_booked
- start_at
- end_at
- related_application_id nullable
- created_at

## trial_applications
- id
- parent_id
- class_id
- assigned_teacher_id nullable
- child_name
- child_grade
- requested_slot_at
- confirmed_slot_at nullable
- confirmed_schedule_block_id nullable
- memo
- status: new | reviewing | confirmed | completed | canceled
- created_at

## application_logs
- id
- application_id
- from_status
- to_status
- actor_id
- note
- created_at
