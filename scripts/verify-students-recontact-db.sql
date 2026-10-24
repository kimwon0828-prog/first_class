-- 2차-3 학생 · 안내 보내기 DB 검증 (로컬 Supabase 전용, 모두 ROLLBACK).
--
-- node scripts/verify-students-recontact-db.cjs 가 로컬 docker 컨테이너의 psql 로 돌린다.
-- 20261024120000_students_recontact 까지 적용된 로컬 DB(supabase db reset --local)에서
--   - 수신 동의 RPC · RLS
--   - 발송 자리 잡기(스탠다드 · 동의 · 같은 번호 · 080 · 월 200건 · 중복 클릭 · 남의 수업)
--   - 다음 연락 저장
--   - 개인정보 파기(20261022120000): 학부모 탈퇴 · 12개월 보관 파기를 recontact_recipients 행이 있는 상태에서 끝까지
-- 를 확인한다. 결과는 PASS|… / FAIL|… 줄로 나온다.

\set ON_ERROR_STOP 1
begin;

create temp table _r (n serial, ok boolean, label text);
create temp table _res (k text, v jsonb);
grant all on _r, _res to authenticated, service_role;
grant usage on sequence _r_n_seq to authenticated, service_role;

-- ── fixtures ─────────────────────────────────────────────────
-- 학원 A(스탠다드) · 학원 B(무료), 학원 계정 둘, 학부모 셋
insert into public.organizations(id, name) values
  ('d1000000-0000-4000-8000-000000000001', '검증학원'),
  ('d1000000-0000-4000-8000-000000000002', '다른학원');
insert into public.organization_subscriptions(organization_id, plan_code, subscription_status, current_period_start, current_period_end)
values ('d1000000-0000-4000-8000-000000000001', 'standard', 'active', now() - interval '1 day', now() + interval '29 days');
insert into auth.users(id, email) values
  ('d2000000-0000-4000-8000-000000000001', 'acad-a@verify.local'),
  ('d2000000-0000-4000-8000-000000000005', 'acad-b@verify.local'),
  ('d2000000-0000-4000-8000-000000000002', 'p1@verify.local'),
  ('d2000000-0000-4000-8000-000000000003', 'p2@verify.local'),
  ('d2000000-0000-4000-8000-000000000004', 'p3@verify.local');
insert into public.profiles(id, role, name, organization_id) values
  ('d2000000-0000-4000-8000-000000000001', 'academy', '원장A', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000005', 'academy', '원장B', 'd1000000-0000-4000-8000-000000000002')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
-- 학부모 계정 번호는 신청서 번호와 같게 둔다(20261025120000 부터 안내 문자는 계정 번호로 간다).
insert into public.profiles(id, role, name, phone) values
  ('d2000000-0000-4000-8000-000000000002', 'parent', '학부모1', '010-1111-2222'),
  ('d2000000-0000-4000-8000-000000000003', 'parent', '학부모2', '010-3333-4444'),
  ('d2000000-0000-4000-8000-000000000004', 'parent', '학부모3', '010-7777-8888')
on conflict (id) do update set role = 'parent', phone = excluded.phone;
insert into public.classes(id, organization_id, title, program_type, subject, target_age, description) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '로봇 코딩 체험', 'trial_class', 'coding', '초등', '검증'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', '다른 학원 수업', 'trial_class', 'coding', '초등', '검증');

-- 체험 시각: 최근(2일 전) · 오래전(400일 전, 12개월 보관 기간 지남). 날짜 하나짜리 일정으로 둔다.
create temp table _slot as select
  date_trunc('hour', now() - interval '2 days') as recent,
  date_trunc('hour', now() - interval '400 days') as old;
insert into public.class_schedules(id, class_id, schedule_type, specific_date, start_time, end_time, capacity)
select 'd6000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'one_time',
  (recent at time zone 'Asia/Seoul')::date, (recent at time zone 'Asia/Seoul')::time, ((recent + interval '1 hour') at time zone 'Asia/Seoul')::time, 10 from _slot;
insert into public.class_schedules(id, class_id, schedule_type, specific_date, start_time, end_time, capacity)
select 'd6000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 'one_time',
  (old at time zone 'Asia/Seoul')::date, (old at time zone 'Asia/Seoul')::time, ((old + interval '1 hour') at time zone 'Asia/Seoul')::time, 10 from _slot;

-- A1 · A2 형제(같은 번호, 학부모1) / A3 학부모2(동의 안 함) / A4 엑셀(학부모 계정 없음) / A5 학부모3(오래전 체험)
insert into public.trial_applications(id, class_id, class_schedule_id, parent_id, child_name, child_grade, parent_name, parent_phone,
  requested_slot_at, confirmed_slot_at, completed_at, status, registration_status)
select v.id, 'd3000000-0000-4000-8000-000000000001', v.schedule_id, v.parent_id, v.child_name, 'elem_4', '보호자', v.phone,
  v.slot, v.slot, v.slot + interval '1 hour', 'completed', 'not_enrolled'
from _slot, lateral (values
  ('d4000000-0000-4000-8000-000000000001'::uuid, 'd6000000-0000-4000-8000-000000000001'::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid, '하람', '010-1111-2222', _slot.recent),
  ('d4000000-0000-4000-8000-000000000002'::uuid, 'd6000000-0000-4000-8000-000000000001'::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid, '하윤', '01011112222', _slot.recent),
  ('d4000000-0000-4000-8000-000000000003'::uuid, 'd6000000-0000-4000-8000-000000000001'::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid, '서준', '010-3333-4444', _slot.recent),
  ('d4000000-0000-4000-8000-000000000004'::uuid, 'd6000000-0000-4000-8000-000000000001'::uuid, null::uuid, '엑셀학생', '010-5555-6666', _slot.recent),
  ('d4000000-0000-4000-8000-000000000005'::uuid, 'd6000000-0000-4000-8000-000000000002'::uuid, 'd2000000-0000-4000-8000-000000000004'::uuid, '지우', '010-7777-8888', _slot.old)
) as v(id, schedule_id, parent_id, child_name, phone, slot);

insert into _r(ok, label) select count(*) = 5, '표 5개' from information_schema.tables
  where table_schema = 'public' and table_name in ('parent_marketing_consents', 'parent_marketing_consent_events', 'marketing_opt_out_phones', 'recontact_batches', 'recontact_recipients');
insert into _r(ok, label) select app.recontact_phone_hash('010-1234-5678') = app.recontact_phone_hash('01012345678'), '번호 해시는 숫자만 본다';

-- ── 수신 동의(학부모 본인) ─────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select (public.set_my_academy_marketing_consent('d1000000-0000-4000-8000-000000000001', true, 'parent_app', 'academy-marketing-2026-10')->>'consented')::boolean, '학부모1 동의(RPC)';
insert into _r(ok, label) select count(*) = 1, '학부모1 목록 1건' from public.list_my_academy_marketing_consents();
do $$ begin
  perform public.set_my_academy_marketing_consent('d1000000-0000-4000-8000-000000000001', true, 'admin', 'v');
  insert into _r(ok, label) values (false, '학부모가 admin 출처를 썼다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'invalid_consent_source', '학부모는 parent_app/web 출처만 쓴다');
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select (public.set_my_academy_marketing_consent('d1000000-0000-4000-8000-000000000001', true, 'parent_web', 'academy-marketing-2026-10')->>'consented')::boolean, '학부모3 동의(웹)';
reset role;
insert into _r(ok, label) select count(*) = 2, '동의 이력 2건' from public.parent_marketing_consent_events where organization_id = 'd1000000-0000-4000-8000-000000000001';

-- 학원 계정은 동의를 대신 넣을 수 없다
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.set_my_academy_marketing_consent('d1000000-0000-4000-8000-000000000001', true, 'parent_app', 'v');
  insert into _r(ok, label) values (false, '학원이 동의를 대신 넣었다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'parent_required', '학원 계정은 동의를 대신 넣지 못한다');
end $$;

-- ── 발송 자리 잡기(학원 A, 스탠다드) ───────────────────────────
insert into _res select 'b1', public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000001',
  array['d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000004']::uuid[],
  'new_class', 'd3000000-0000-4000-8000-000000000001', '{학생} 보호자님, 새 반이 열려요.', 'https://firstsuup.com/classes/d3000000-0000-4000-8000-000000000001', '080-123-4567', '02-123-4567');
insert into _r(ok, label) select (v->>'reserved')::int = 1 and (v->>'skipped')::int = 3 and jsonb_array_length(v->'recipients') = 1,
  '동의한 보호자 1명만(형제 같은 번호 1통 · 미동의 · 엑셀 제외)' from _res where k = 'b1';
insert into _r(ok, label) select (v->'recipients'->0->>'applicationId') in ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002'),
  '돌려준 받는 사람은 학부모1 신청' from _res where k = 'b1';
insert into _r(ok, label) select recipient_phone_masked = '010-****-2222', '마스킹 번호 010-****-2222'
  from public.recontact_recipients where batch_id = 'd5000000-0000-4000-8000-000000000001';
insert into _res select 'dup', public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000001',
  array['d4000000-0000-4000-8000-000000000001']::uuid[], 'new_class', null, 'x', null, '080-123-4567', '02-123-4567');
insert into _r(ok, label) select v->>'mode' = 'duplicate', '같은 발송 id 를 다시 누르면 duplicate(다시 보내지 않음)' from _res where k = 'dup';
insert into _r(ok, label) select count(*) = 1, '중복 클릭에도 받는 사람은 1명' from public.recontact_recipients where batch_id = 'd5000000-0000-4000-8000-000000000001';
insert into _res select 'b5', public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000005',
  array['d4000000-0000-4000-8000-000000000005']::uuid[], 'special', null, '{학생} 보호자님, 특강이 열려요.', null, '080-123-4567', '02-123-4567');
insert into _r(ok, label) select (v->>'reserved')::int = 1, '학부모3(오래전 체험)도 자리 잡기' from _res where k = 'b5';
do $$ begin
  perform public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000004', array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'special', 'd3000000-0000-4000-8000-000000000002', 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '다른 학원 수업을 지정했다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_class_forbidden', '다른 학원 수업은 지정할 수 없다');
end $$;
do $$ begin
  perform public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000006', array['d4000000-0000-4000-8000-000000000003']::uuid[],
    'special', null, 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '동의 안 한 보호자에게 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '동의 안 한 보호자만 고르면 거절');
end $$;
-- 학원은 받는 사람 결과를 직접 바꿀 수 없다(service role 만)
do $$ begin
  update public.recontact_recipients set status = 'failed' where batch_id = 'd5000000-0000-4000-8000-000000000001';
  insert into _r(ok, label) values (false, '학원 계정이 발송 결과를 바꿨다');
exception when insufficient_privilege then insert into _r(ok, label) values (true, '학원 계정은 발송 결과를 바꾸지 못한다');
end $$;
insert into _r(ok, label) select count(*) = 2, '학원 A 는 자기 학원 동의 2건을 읽는다' from public.parent_marketing_consents;
insert into _r(ok, label) select count(*) = 2, '학원 A 는 자기 발송 기록을 읽는다' from public.recontact_recipients;
insert into _r(ok, label) select (public.get_recontact_month_usage()->>'used')::int = 2, '이번 달 사용 2건' ;
reset role;

-- 무료 학원은 DB 에서도 막힌다(서버 액션 확인과 이중)
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000007', array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'special', null, 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '무료 학원이 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_plan_required', '무료 학원은 recontact_plan_required');
end $$;
insert into _r(ok, label) select count(*) = 0, '학원 B 는 학원 A 동의를 못 본다' from public.parent_marketing_consents;
insert into _r(ok, label) select count(*) = 0, '학원 B 는 학원 A 발송 기록을 못 본다' from public.recontact_recipients;
reset role;

-- 내부 전체 권한(override)이면 무료 학원도 열린다(TS resolver 와 같은 입력)
insert into public.organization_entitlement_overrides(organization_id, full_access, reason)
values ('d1000000-0000-4000-8000-000000000002', true, 'verify');
insert into _r(ok, label) select app.organization_can_send_recontact('d1000000-0000-4000-8000-000000000002'), 'override 학원은 열린다';
update public.organization_entitlement_overrides set expires_at = now() - interval '1 minute' where organization_id = 'd1000000-0000-4000-8000-000000000002';
insert into _r(ok, label) select not app.organization_can_send_recontact('d1000000-0000-4000-8000-000000000002'), '만료된 override 는 닫힌다';
update public.organization_subscriptions set current_period_end = now() - interval '1 minute' where organization_id = 'd1000000-0000-4000-8000-000000000001';
insert into _r(ok, label) select not app.organization_can_send_recontact('d1000000-0000-4000-8000-000000000001'), '기간이 지난 스탠다드는 닫힌다';
update public.organization_subscriptions set current_period_end = now() + interval '29 days' where organization_id = 'd1000000-0000-4000-8000-000000000001';

-- ── 월 200건 ─────────────────────────────────────────────────
-- 지금 2건 + 198건(sent) = 200. failed · dry_run 은 세지 않는다.
insert into public.recontact_batches(id, organization_id, template_kind, body_template, opt_out_number, sender_phone, requested_count, reserved_count)
values ('d5000000-0000-4000-8000-0000000000ff', 'd1000000-0000-4000-8000-000000000001', 'custom', 'x', '080-123-4567', '02-123-4567', 1, 1);
insert into public.recontact_recipients(batch_id, organization_id, application_id, phone_hash, recipient_phone_masked, status)
select 'd5000000-0000-4000-8000-0000000000ff', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', md5(g::text) || md5(g::text), '010-****-0000', 'sent'
from generate_series(1, 198) g;
insert into public.recontact_recipients(batch_id, organization_id, application_id, phone_hash, recipient_phone_masked, status)
select 'd5000000-0000-4000-8000-0000000000ff', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', md5('f' || g) || md5('f' || g), '010-****-0000', case when g % 2 = 0 then 'failed' else 'dry_run' end
from generate_series(1, 6) g;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select (public.get_recontact_month_usage()->>'used')::int = 200, '실패 · dry_run 은 한도에서 빠진다(사용 200)';
insert into _res select 'limit', public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000002',
  array['d4000000-0000-4000-8000-000000000005']::uuid[], 'special', null, 'x', null, '080-123-4567', '02-123-4567');
insert into _r(ok, label) select v->>'mode' = 'limit_exceeded' and (v->>'used')::int = 200, '월 200건을 넘으면 거절' from _res where k = 'limit';
insert into _r(ok, label) select not exists(select 1 from public.recontact_batches where id = 'd5000000-0000-4000-8000-000000000002'), '거절되면 아무것도 남기지 않는다';
reset role;

-- ── 080 수신거부 ─────────────────────────────────────────────
delete from public.recontact_recipients where batch_id = 'd5000000-0000-4000-8000-0000000000ff';
insert into public.marketing_opt_out_phones(phone_hash, source) values (app.recontact_phone_hash('010-1111-2222'), 'opt_out_080');
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('d5000000-0000-4000-8000-000000000003', array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'special', null, 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '080 거부 번호에 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '080 수신거부 번호는 빠진다');
end $$;

-- ── 다음 연락 ────────────────────────────────────────────────
insert into _r(ok, label) select (public.set_studio_next_contact('d4000000-0000-4000-8000-000000000003', '2026-11-01', '토요일 반 생기면 안내')->>'nextContactAt')::timestamptz = '2026-11-01T00:00:00Z',
  '다음 연락 = 그 날 09:00 KST';
do $$ begin
  perform public.set_studio_next_contact('d4000000-0000-4000-8000-000000000003', '2026-11-01', null);
  insert into _r(ok, label) values (false, '날짜만 저장됐다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'invalid_next_contact', '날짜와 메모는 함께 저장한다');
end $$;
reset role;
insert into _r(ok, label) select follow_up_note = '토요일 반 생기면 안내', '메모는 follow_up_note 에' from public.trial_applications where id = 'd4000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.set_studio_next_contact('d4000000-0000-4000-8000-000000000003', '2026-11-02', '남의 학생');
  insert into _r(ok, label) values (false, '다른 학원 학생의 다음 연락을 바꿨다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'application_not_found_or_forbidden', '다른 학원 학생은 바꿀 수 없다');
end $$;
reset role;

-- 학부모는 동의 행만 자기 것을 보고, 발송 기록은 못 본다
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select count(*) = 0, '다른 학부모의 동의는 보이지 않는다' from public.parent_marketing_consents;
insert into _r(ok, label) select count(*) = 0, '학부모에게 발송 기록이 보이지 않는다' from public.recontact_recipients;
reset role;

-- ── 개인정보 파기 실검증 ─────────────────────────────────────
insert into _r(ok, label) select count(*) = 2, '파기 전: 학부모1 · 학부모3 신청에 발송 기록이 있다'
  from public.recontact_recipients where application_id in ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000005');
do $$ begin perform app.assert_trial_purge_schema(); insert into _r(ok, label) values (true, '파기 참조 검사가 recontact_recipients 를 받아들인다');
exception when others then insert into _r(ok, label) values (false, '파기 참조 검사 실패: ' || sqlerrm); end $$;
-- 대조: 검토 목록에 없는 참조가 생기면 파기가 멈춘다(검사가 살아 있다). 표는 예외와 함께 되돌려진다.
do $$ begin
  create table public._verify_unreviewed_reference (application_id uuid references public.trial_applications(id) on delete cascade);
  perform app.assert_trial_purge_schema();
  insert into _r(ok, label) values (false, '대조: 검토 안 된 참조를 받아들였다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'privacy_reference_schema_review_required', '대조: 검토 안 된 참조가 있으면 파기가 멈춘다');
end $$;

-- 1) 학부모1 탈퇴(10-22 prepare_my_parent_account_deletion 그대로)
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'withdraw', to_jsonb(public.prepare_my_parent_account_deletion());
reset role;
insert into _r(ok, label) select v #>> '{}' = 'db_cleaned', '학부모 탈퇴가 끝까지 간다(db_cleaned)' from _res where k = 'withdraw';
insert into _r(ok, label) select count(*) = 0, '탈퇴: 그 학부모 신청의 발송 기록이 지워진다'
  from public.recontact_recipients where application_id in ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002');
insert into _r(ok, label) select count(*) = 2, '탈퇴: 신청은 파기 표시 + 이름 삭제'
  from public.trial_applications where id in ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002') and privacy_erased_at is not null and child_name is null;
insert into _r(ok, label) select count(*) = 0, '탈퇴: 수신 동의 · 이력도 지워진다'
  from (select parent_id from public.parent_marketing_consents where parent_id = 'd2000000-0000-4000-8000-000000000002'
        union all select parent_id from public.parent_marketing_consent_events where parent_id = 'd2000000-0000-4000-8000-000000000002') x;
do $$ begin
  insert into public.recontact_recipients(batch_id, organization_id, application_id, phone_hash, recipient_phone_masked)
  values ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', repeat('a', 64), '010-****-2222');
  insert into _r(ok, label) values (false, '파기된 신청에 발송 기록을 다시 썼다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'privacy_content_erased', '파기된 신청에는 발송 기록을 다시 못 쓴다');
end $$;

-- 2) 12개월 보관 파기(10-22 prepare_trial_privacy_retention_batch 그대로, service role)
insert into app.trial_privacy_execution_scopes(organization_id, enabled) values ('d1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
insert into _res select 'retention', public.prepare_trial_privacy_retention_batch('d1000000-0000-4000-8000-000000000001', 10);
reset role;
insert into _r(ok, label) select (v->>'prepared')::int = 1 and (v->>'blocked')::int = 0, '보관 파기가 막히지 않고 끝까지 간다: ' || v::text from _res where k = 'retention';
insert into _r(ok, label) select count(*) = 0, '보관 파기: 발송 기록이 지워진다'
  from public.recontact_recipients where application_id = 'd4000000-0000-4000-8000-000000000005';
-- 보관 파기는 마지막에 신청 행 자체를 지우고 월별 합계(app.trial_monthly_retention_totals)에 1건으로만 남긴다.
insert into _r(ok, label) select not exists(select 1 from public.trial_applications where id = 'd4000000-0000-4000-8000-000000000005'),
  '보관 파기: 신청 행까지 지워진다';
insert into _r(ok, label) select coalesce(sum(applications), 0) = 1, '보관 파기: 월별 합계에 1건'
  from app.trial_monthly_retention_totals where organization_id = 'd1000000-0000-4000-8000-000000000001';
insert into _r(ok, label) select count(*) = 0, '보관 파기: 막힌 작업이 없다'
  from app.trial_retention_jobs where organization_id = 'd1000000-0000-4000-8000-000000000001' and state = 'blocked';
insert into _r(ok, label) select count(*) = 1, '발송 1건 기록(batch, 템플릿만)은 학원 기록으로 남는다'
  from public.recontact_batches where id = 'd5000000-0000-4000-8000-000000000005' and body_template not like '%지우%';

select (case when ok then 'PASS' else 'FAIL' end) || '|' || label from _r order by n;
rollback;
select 'ROLLED_BACK|' || (not exists(select 1 from public.organizations where id = 'd1000000-0000-4000-8000-000000000001'));
