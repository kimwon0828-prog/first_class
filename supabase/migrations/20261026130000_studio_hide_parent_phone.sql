-- 학원(Studio)에 학부모 휴대폰 번호를 보여 주지 않는다.
--
-- 첫수업은 전화 상담 없이 체험을 연결한다(대표 결정 2026-10-26). 학부모는 체험에 함께 오고,
-- 번호가 필요한 연락(확정 · 전날 알림 · 리포트 · 학원 소식)은 첫수업이 보낸다(service role 서버 경로).
--
-- 학원에 번호가 보이는 경우는 두 가지뿐이다.
--   1. 등록 학생: registration_status = 'enrolled'
--   2. 엑셀로 가져온 신청: import_batch_id is not null (학원이 직접 넣은 번호)
--
-- 바꾸는 것
--   - studio_trial_applications: parent_phone 만 위 조건의 case 식으로. 열 목록 · 순서 · where · check option 은 운영 뷰 그대로
--     (2026-10-26 pg_get_viewdef · reloptions 확인: 52열, check_option=cascaded).
--   - authenticated 의 parent_phone update 권한 회수. select 와 나머지 update 열 grant 는 그대로다.
--
-- 확인한 다른 경로(2026-10-26, 운영 읽기 전용)
--   - trial_applications 표: authenticated select 권한 없음.
--   - authenticated 가 실행할 수 있는 함수 중 parent_phone · to_jsonb(ta) · ta.* 를 학원에 돌려주는 것 없음
--     (publish_experience_report* · withdraw_experience_report 는 id · version 만, import_studio_trial_reservations 는 batch 요약만 돌려준다).
--   - my_trial_applications 는 parent_id = auth.uid() 학부모 본인 뷰.
--   - profiles.phone: 학원은 같은 organization_id 프로필만 읽는다(학부모는 organization_id 없음).
--   - sms_logs · recontact_recipients 는 가린 번호만 저장.
--
-- 새 표가 없다 → 파기 허용 목록(app.assert_trial_purge_schema) 영향 없음.
-- ⚠️ CLI 가 이 파일을 transaction 으로 감싸지 않으므로 begin/commit · set 을 두지 않는다(20261025120000 과 같다).

create or replace view public.studio_trial_applications as
select
  ta.id,
  ta.parent_id,
  ta.class_id,
  ta.assigned_teacher_id,
  ta.child_name,
  ta.child_grade,
  ta.requested_slot_at,
  ta.confirmed_slot_at,
  ta.confirmed_schedule_block_id,
  ta.memo,
  ta.status,
  ta.created_at,
  ta.updated_at,
  ta.requested_schedule_block_id,
  ta.parent_name,
  case when ta.registration_status = 'enrolled' or ta.import_batch_id is not null
       then ta.parent_phone end as parent_phone,
  ta.child_school,
  ta.child_notes,
  ta.subject_experience_yn,
  ta.subject_experience_duration,
  ta.current_level,
  ta.preferred_regular_schedule,
  ta.goal_type,
  ta.goal_note,
  ta.consultation_note,
  ta.trial_feedback,
  ta.final_level,
  ta.final_schedule,
  ta.child_id,
  ta.registration_status,
  ta.registered_course,
  ta.unregistered_reason,
  ta.follow_up_note,
  ta.class_schedule_id,
  ta.selected_schedule_label,
  ta.contacted_at,
  ta.scheduled_at,
  ta.completed_at,
  ta.enrolled_at,
  ta.canceled_at,
  ta.no_show_at,
  ta.next_contact_at,
  ta.last_activity_at,
  ta.lost_at,
  ta.unregistered_reason_note,
  ta.regular_schedule_preference,
  ta.regular_schedule_preference_note,
  ta.regular_schedule_preference_updated_at,
  ta.import_batch_id,
  ta.interest_subjects,
  ta.registration_reason_ids,
  ta.registration_note
from public.trial_applications ta
where app.current_role() = 'teacher' and ta.class_id in
 (select c.id from public.classes c where c.organization_id = app.current_org_id())
with cascaded check option;

revoke update (parent_phone) on public.studio_trial_applications from authenticated;
