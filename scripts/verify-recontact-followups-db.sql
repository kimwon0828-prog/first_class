-- 학생 안내 문자 후속(20261025120000) DB 검증 (로컬 Supabase 전용, 모두 ROLLBACK).
--
-- node scripts/verify-recontact-followups-db.cjs 가 로컬 docker 컨테이너의 psql 로 돌린다.
-- 로컬 DB 에 20261025120000 이 아직 없으면 cjs 가 migration 본문을 이 transaction 안(아래 :MIGRATION 자리)에 넣는다
-- → 적용 · 검증 · ROLLBACK 뒤 표가 사라졌는지까지 본다(롤백 검증).
--   - 계정 번호(010 휴대폰) · 학생 목록 잠금용 조회 · 080 학부모 찾기
--   - 동의 RPC changed(없음→거부 false · 없음→동의 true · 같은 값 false · 바뀜 true) · advisory lock
--   - 처리 결과 알림 기록: 권한 · 080 규칙 · 번호마다 한 번(claimed · sent · skipped 자리, failed · dry_run 은 비움)
--   - 안내 문자 opted_out: 한도에서 빠짐 · 새 열은 학원에 안 열림
--   - 발송 자리 잡기가 신청서 번호가 아니라 계정 번호로 고른다(080 · 같은 번호 · 번호 없음)

\set ON_ERROR_STOP 1
begin;

-- :MIGRATION

create temp table _r (n serial, ok boolean, label text);
create temp table _res (k text, v jsonb);
grant all on _r, _res to authenticated, service_role;
grant usage on sequence _r_n_seq to authenticated, service_role;

-- ── fixtures ─────────────────────────────────────────────────
insert into public.organizations(id, name) values
  ('e1000000-0000-4000-8000-000000000001', '후속검증학원'),
  ('e1000000-0000-4000-8000-000000000002', '다른학원');
insert into public.organization_subscriptions(organization_id, plan_code, subscription_status, current_period_start, current_period_end)
values ('e1000000-0000-4000-8000-000000000001', 'standard', 'active', now() - interval '1 day', now() + interval '29 days');
insert into auth.users(id, email) values
  ('e2000000-0000-4000-8000-000000000001', 'acad-a@followups.local'),
  ('e2000000-0000-4000-8000-000000000002', 'p1@followups.local'),
  ('e2000000-0000-4000-8000-000000000003', 'p2@followups.local'),
  ('e2000000-0000-4000-8000-000000000004', 'p3@followups.local'),
  ('e2000000-0000-4000-8000-000000000005', 'p4@followups.local');
insert into public.profiles(id, role, name, organization_id) values
  ('e2000000-0000-4000-8000-000000000001', 'academy', '원장', 'e1000000-0000-4000-8000-000000000001')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
-- p1: 계정 번호가 신청서 번호와 다르다 / p2: +82 형식 / p3: 계정 번호 없음 / p4: 유선 번호(휴대폰 아님)
insert into public.profiles(id, role, name, phone) values
  ('e2000000-0000-4000-8000-000000000002', 'parent', '학부모1', '010-2000-0001'),
  ('e2000000-0000-4000-8000-000000000003', 'parent', '학부모2', '+82 10-2000-0002'),
  ('e2000000-0000-4000-8000-000000000004', 'parent', '학부모3', null),
  ('e2000000-0000-4000-8000-000000000005', 'parent', '학부모4', '02-123-4567')
on conflict (id) do update set role = 'parent', phone = excluded.phone;
insert into public.classes(id, organization_id, title, program_type, subject, target_age, description) values
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '로봇 코딩 체험', 'trial_class', 'coding', '초등', '검증'),
  ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', '다른 학원 수업', 'trial_class', 'coding', '초등', '검증');
create temp table _slot as select date_trunc('hour', now() - interval '2 days') as recent;
insert into public.class_schedules(id, class_id, schedule_type, specific_date, start_time, end_time, capacity)
select 'e6000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'one_time',
  (recent at time zone 'Asia/Seoul')::date, (recent at time zone 'Asia/Seoul')::time, ((recent + interval '1 hour') at time zone 'Asia/Seoul')::time, 10 from _slot;
insert into public.class_schedules(id, class_id, schedule_type, specific_date, start_time, end_time, capacity)
select 'e6000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'one_time',
  (recent at time zone 'Asia/Seoul')::date, (recent at time zone 'Asia/Seoul')::time, ((recent + interval '1 hour') at time zone 'Asia/Seoul')::time, 10 from _slot;
-- A1 학부모1(신청서 번호 010-9999-0001) / A2 학부모2 / A3 학부모3(계정 번호 없음) / A4 학부모4(유선) / B1 학부모1 → 다른 학원
insert into public.trial_applications(id, class_id, class_schedule_id, parent_id, child_name, child_grade, parent_name, parent_phone,
  requested_slot_at, confirmed_slot_at, completed_at, status, registration_status)
select v.id, v.class_id, v.schedule_id, v.parent_id, v.child_name, 'elem_4', '보호자', v.phone,
  _slot.recent, _slot.recent, _slot.recent + interval '1 hour', 'completed', 'not_enrolled'
from _slot, lateral (values
  ('e4000000-0000-4000-8000-000000000001'::uuid, 'e3000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000002'::uuid, '하람', '010-9999-0001'),
  ('e4000000-0000-4000-8000-000000000002'::uuid, 'e3000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000003'::uuid, '서준', '010-9999-0002'),
  ('e4000000-0000-4000-8000-000000000003'::uuid, 'e3000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000004'::uuid, '지우', '010-9999-0003'),
  ('e4000000-0000-4000-8000-000000000004'::uuid, 'e3000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000005'::uuid, '도윤', '010-9999-0004'),
  ('e4000000-0000-4000-8000-000000000005'::uuid, 'e3000000-0000-4000-8000-000000000002'::uuid, 'e6000000-0000-4000-8000-000000000002'::uuid, 'e2000000-0000-4000-8000-000000000002'::uuid, '하람', '010-9999-0001')
) as v(id, class_id, schedule_id, parent_id, child_name, phone);
-- 넷 다 학원 A 에 동의(직접 넣는다 — 동의 RPC 는 아래에서 따로 본다)
insert into public.parent_marketing_consents(parent_id, organization_id, consented, consented_at, source, text_version)
select id, 'e1000000-0000-4000-8000-000000000001', true, now(), 'parent_app', 'v'
from public.profiles where id in ('e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000005');

-- ── 1. 계정 번호 ─────────────────────────────────────────────
insert into _r(ok, label) select app.recontact_account_phone('e2000000-0000-4000-8000-000000000002') = '01020000001', '계정 번호: 숫자만(010-2000-0001 → 01020000001)';
insert into _r(ok, label) select app.recontact_account_phone('e2000000-0000-4000-8000-000000000003') = '01020000002', '계정 번호: +82 10 → 010';
insert into _r(ok, label) select app.recontact_account_phone('e2000000-0000-4000-8000-000000000004') is null, '계정 번호 없음 → null';
insert into _r(ok, label) select app.recontact_account_phone('e2000000-0000-4000-8000-000000000005') is null, '유선 번호는 휴대폰이 아니다 → null';
insert into _r(ok, label) select app.recontact_account_phone('e2000000-0000-4000-8000-000000000001') is null, '학원 계정은 학부모 번호가 아니다 → null';
insert into _r(ok, label) select not has_function_privilege('authenticated', 'app.recontact_account_phone(uuid)', 'execute'), '계정 번호 함수는 로그인 사용자가 못 부른다';

-- 학생 목록 잠금용(학원 A)
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label)
select array_agg(x order by x) = array['e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000003']::uuid[],
  '학원 A: 번호가 준비된 학부모는 1 · 2 만(3 없음 · 4 유선)'
from public.list_studio_recontact_phone_ready(array['e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000005']::uuid[]) as x;
reset role;
-- 학부모 계정이 부르면 아무것도 안 나온다(학원 계정만)
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select count(*) = 0, '학부모 계정은 번호 준비 여부를 못 본다'
from public.list_studio_recontact_phone_ready(array['e2000000-0000-4000-8000-000000000002']::uuid[]);
reset role;
-- ⚠️ 권한 없는 함수를 DO 블록의 exception 안에서 부르면 로컬 Postgres 이미지가 segfault 한다(내장 pg_read_file 도 같다).
--    그래서 실행 권한은 has_function_privilege 로 본다.
insert into _r(ok, label)
select not has_function_privilege('authenticated', 'public.find_recontact_parents_by_phone_hash(text[])', 'execute')
  and not has_function_privilege('anon', 'public.find_recontact_parents_by_phone_hash(text[])', 'execute')
  and has_function_privilege('service_role', 'public.find_recontact_parents_by_phone_hash(text[])', 'execute'),
  '080 학부모 찾기는 service role 만';
-- NCP 가 주는 번호(01020000002)의 해시. app 스키마는 service role 도 못 쓰므로 먼저 계산해 둔다.
insert into _res select 'hash2', to_jsonb(app.recontact_phone_hash('01020000002'));
set local role service_role;
insert into _r(ok, label)
select count(*) = 1 and bool_and(f.parent_id = 'e2000000-0000-4000-8000-000000000003'), '080 학부모 찾기: +82 계정 번호도 같은 해시로 찾는다'
from _res, public.find_recontact_parents_by_phone_hash(array[_res.v #>> '{}']) f where _res.k = 'hash2';
reset role;

-- ── 2. 동의 RPC changed ──────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c1', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', false, 'parent_app', 'v');
insert into _res select 'c2', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', true, 'parent_app', 'v');
insert into _res select 'c3', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', true, 'parent_web', 'v');
insert into _res select 'c4', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', false, 'parent_web', 'v');
insert into _res select 'c5', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', false, 'parent_web', 'v');
insert into _res select 'c6', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', true, 'parent_app', 'v');
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean = false, '처음 보낸 거부(행 없음 → 거부) changed=false' from _res where k = 'c1';
insert into _r(ok, label) select (v->>'changed')::boolean = true and (v->>'consented')::boolean, '거부 → 동의 changed=true' from _res where k = 'c2';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '동의 → 동의(같은 값) changed=false' from _res where k = 'c3';
insert into _r(ok, label) select (v->>'changed')::boolean = true, '동의 → 거부 changed=true' from _res where k = 'c4';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '거부 → 거부 changed=false' from _res where k = 'c5';
insert into _r(ok, label) select (v->>'changed')::boolean = true, '다시 동의 changed=true' from _res where k = 'c6';
insert into _r(ok, label) select v ?& array['organizationId', 'consented', 'consentedAt', 'withdrawnAt'], '응답 계약(기존 4개 키) 그대로' from _res where k = 'c6';
delete from public.parent_marketing_consents where parent_id = 'e2000000-0000-4000-8000-000000000004' and organization_id = 'e1000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c7', public.set_my_academy_marketing_consent('e1000000-0000-4000-8000-000000000002', true, 'parent_app', 'v');
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean = true, '처음 동의(행 없음 → 동의) changed=true' from _res where k = 'c7';
insert into _r(ok, label) select count(*) = 7, '이력은 요청마다 남는다(7건)' from public.parent_marketing_consent_events
  where parent_id = 'e2000000-0000-4000-8000-000000000004' and organization_id = 'e1000000-0000-4000-8000-000000000002';
insert into _r(ok, label)
select prosrc like '%pg_advisory_xact_lock(hashtextextended(''marketing-consent:'' || v_uid::text || '':'' || p_organization_id::text, 0))%'
  and position('pg_advisory_xact_lock' in prosrc) < position('into v_previous' in prosrc),
  '이전 값을 읽기 전에 학부모 · 학원 advisory lock'
from pg_proc where oid = 'public.set_my_academy_marketing_consent(uuid,boolean,text,text)'::regprocedure;
insert into _r(ok, label) select has_function_privilege('authenticated', 'public.set_my_academy_marketing_consent(uuid,boolean,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_my_academy_marketing_consent(uuid,boolean,text,text)', 'execute'), '동의 RPC 권한 그대로(로그인만)';

-- ── 3. 처리 결과 알림 기록 ───────────────────────────────────
insert into _r(ok, label) select not has_table_privilege('authenticated', 'public.marketing_consent_notices', 'select')
  and not has_table_privilege('authenticated', 'public.marketing_consent_notices', 'insert')
  and not has_table_privilege('anon', 'public.marketing_consent_notices', 'select'), '알림 기록은 학원 · 학부모가 못 읽고 못 쓴다';
insert into _r(ok, label) select relrowsecurity, '알림 기록 RLS 켜짐' from pg_class where oid = 'public.marketing_consent_notices'::regclass;
set local role service_role;
insert into public.marketing_consent_notices(parent_id, organization_id, action, source, occurred_at, status, recipient_phone_masked)
values ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'consent', 'parent_app', now(), 'dry_run', '010-****-0001');
insert into _r(ok, label) values (true, 'service role 은 앱 동의 알림을 기록한다');
do $$ begin
  insert into public.marketing_consent_notices(parent_id, organization_id, action, source, phone_hash, occurred_at, status)
  values ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'withdraw', 'opt_out_080', repeat('a', 64), now(), 'sent');
  insert into _r(ok, label) values (false, '080 알림에 학원이 들어갔다');
exception when check_violation then insert into _r(ok, label) values (true, '080 알림은 학원 없이(모든 학원)');
end $$;
do $$ begin
  insert into public.marketing_consent_notices(parent_id, organization_id, action, source, occurred_at, status)
  values ('e2000000-0000-4000-8000-000000000002', null, 'withdraw', 'opt_out_080', now(), 'sent');
  insert into _r(ok, label) values (false, '080 알림에 번호 열쇠가 없다');
exception when check_violation then insert into _r(ok, label) values (true, '080 알림은 번호 열쇠가 있어야 한다');
end $$;
insert into public.marketing_consent_notices(parent_id, action, source, phone_hash, occurred_at, status)
values ('e2000000-0000-4000-8000-000000000002', 'withdraw', 'opt_out_080', repeat('b', 64), now(), 'claimed');
do $$ begin
  insert into public.marketing_consent_notices(parent_id, action, source, phone_hash, occurred_at, status)
  values ('e2000000-0000-4000-8000-000000000002', 'withdraw', 'opt_out_080', repeat('b', 64), now(), 'claimed');
  insert into _r(ok, label) values (false, '같은 번호 080 알림 자리를 두 번 잡았다');
exception when unique_violation then insert into _r(ok, label) values (true, '같은 번호 080 알림 자리는 하나(claimed)');
end $$;
update public.marketing_consent_notices set status = 'failed' where phone_hash = repeat('b', 64);
insert into public.marketing_consent_notices(parent_id, action, source, phone_hash, occurred_at, status)
values ('e2000000-0000-4000-8000-000000000002', 'withdraw', 'opt_out_080', repeat('b', 64), now(), 'claimed');
insert into _r(ok, label) values (true, '실패한 080 알림은 다음에 다시 자리를 잡는다');
update public.marketing_consent_notices set status = 'sent' where phone_hash = repeat('b', 64) and status = 'claimed';
do $$ begin
  insert into public.marketing_consent_notices(parent_id, action, source, phone_hash, occurred_at, status)
  values ('e2000000-0000-4000-8000-000000000002', 'withdraw', 'opt_out_080', repeat('b', 64), now(), 'claimed');
  insert into _r(ok, label) values (false, '보낸 번호에 080 알림을 다시 잡았다');
exception when unique_violation then insert into _r(ok, label) values (true, '보낸 번호에는 080 알림을 다시 보내지 않는다');
end $$;
reset role;

-- ── 4. 발송 자리 잡기: 계정 번호 ─────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'b1', public.reserve_recontact_batch('e5000000-0000-4000-8000-000000000001',
  array['e4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000004']::uuid[],
  'new_class', null, '{학생} 보호자님, 새 반이 열려요.', null, '080-123-4567', '02-123-4567');
reset role;
insert into _r(ok, label) select (v->>'reserved')::int = 2 and (v->>'skipped')::int = 2, '계정 번호가 있는 2명만(번호 없음 · 유선 제외): ' || v::text from _res where k = 'b1';
insert into _r(ok, label)
select array_agg(recipient_phone_masked order by recipient_phone_masked) = array['010-****-0001', '010-****-0002'],
  '받는 번호는 신청서 번호(9999)가 아니라 계정 번호(2000)'
from public.recontact_recipients where batch_id = 'e5000000-0000-4000-8000-000000000001';
insert into _r(ok, label)
select bool_and(phone_hash in (app.recontact_phone_hash('01020000001'), app.recontact_phone_hash('01020000002'))), '번호 해시도 계정 번호'
from public.recontact_recipients where batch_id = 'e5000000-0000-4000-8000-000000000001';

-- 080: 신청서 번호 거부는 상관없고, 계정 번호 거부만 뺀다
insert into public.marketing_opt_out_phones(phone_hash, source) values (app.recontact_phone_hash('01099990002'), 'opt_out_080');
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'b2', public.reserve_recontact_batch('e5000000-0000-4000-8000-000000000002',
  array['e4000000-0000-4000-8000-000000000002']::uuid[], 'special', null, 'x', null, '080-123-4567', '02-123-4567');
reset role;
insert into _r(ok, label) select (v->>'reserved')::int = 1, '신청서 번호가 080 거부여도 계정 번호가 아니면 보낸다' from _res where k = 'b2';
insert into public.marketing_opt_out_phones(phone_hash, source) values (app.recontact_phone_hash('01020000002'), 'opt_out_080');
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('e5000000-0000-4000-8000-000000000003', array['e4000000-0000-4000-8000-000000000002']::uuid[],
    'special', null, 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '계정 번호가 080 거부인데 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '계정 번호가 080 거부면 뺀다');
end $$;
do $$ begin
  perform public.reserve_recontact_batch('e5000000-0000-4000-8000-000000000004', array['e4000000-0000-4000-8000-000000000003']::uuid[],
    'special', null, 'x', null, '080-123-4567', '02-123-4567');
  insert into _r(ok, label) values (false, '계정 번호 없는 학생에게 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '계정 번호 없는 학생만 고르면 거절');
end $$;

-- ── 5. opted_out ─────────────────────────────────────────────
insert into _r(ok, label) select (public.get_recontact_month_usage()->>'used')::int = 3, '이번 달 사용 3건(queued)';
reset role;
update public.recontact_recipients set status = 'opted_out', provider_result_code = 'E917', result_checked_at = now()
where batch_id = 'e5000000-0000-4000-8000-000000000002';
update public.recontact_recipients set status = 'sent' where batch_id = 'e5000000-0000-4000-8000-000000000001';
insert into _r(ok, label) values (true, 'opted_out 상태를 넣을 수 있다');
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label) select (public.get_recontact_month_usage()->>'used')::int = 2, '수신거부로 발송 안 된 건은 한도에서 빠진다(사용 2)';
insert into _r(ok, label) select count(*) = 1, '학원은 opted_out 기록을 status 로 본다'
  from public.recontact_recipients where status = 'opted_out';
reset role;
insert into _r(ok, label) select not has_column_privilege('authenticated', 'public.recontact_recipients', 'provider_result_code', 'select')
  and not has_column_privilege('authenticated', 'public.recontact_recipients', 'result_checked_at', 'select'), '결과 확인 열은 학원에 안 열림';
do $$ begin
  update public.recontact_recipients set status = 'bounced' where batch_id = 'e5000000-0000-4000-8000-000000000002';
  insert into _r(ok, label) values (false, '모르는 상태가 들어갔다');
exception when check_violation then insert into _r(ok, label) values (true, '상태는 queued · sent · failed · dry_run · opted_out 만');
end $$;

-- ── 6. 파기 흐름은 그대로 ────────────────────────────────────
do $$ begin
  perform app.assert_trial_purge_schema();
  insert into _r(ok, label) values (true, '파기 스키마 검사(assert_trial_purge_schema) 통과');
exception when others then insert into _r(ok, label) values (false, '파기 스키마 검사 실패: ' || sqlerrm);
end $$;

select (case when ok then 'PASS' else 'FAIL' end) || '|' || label from _r order by n;
rollback;
select 'ROLLED_BACK|' || (not exists(select 1 from public.organizations where id = 'e1000000-0000-4000-8000-000000000001'));
