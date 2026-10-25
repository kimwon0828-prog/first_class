-- 학원 소식 단일 동의(20261026120000) DB 검증 (로컬 Supabase 전용, 모두 ROLLBACK).
--
-- node scripts/verify-academy-news-consent-db.cjs 가 로컬 docker 컨테이너의 psql 로 돌린다.
-- 로컬 DB 에 20261025120000 · 20261026120000 이 없으면 cjs 가 그 본문을 이 transaction 안(아래 :MIGRATION 자리)에 넣는다
-- → 적용 · 검증 · ROLLBACK 뒤 새 표 · 새 함수가 사라졌는지까지 본다(롤백 검증).
--   - 동의 RPC: 본인만 · changed(없음→거부 false · 없음→동의 true · 같은 값 false · 바뀜 true) · advisory lock · 이력
--   - 읽기: 학부모 본인 · 학원은 자기 학원에 신청한 학부모의 동의 여부 · 시각만(출처 · 문구 버전 · 다른 학원 학부모 안 보임)
--   - 080 철회: service role 만 · 동의 중일 때만 바꾸고 이력(opt_out_080) · 멱등
--   - 처리 결과 알림: 학원 없는 앱 알림 · 080 규칙 그대로
--   - 발송 자리 잡기: 단일 동의 + 계정 번호 + 080 아님 + 파기 아님, 옛 학원별 동의는 더 보지 않는다 · 시그니처 그대로
--   - 학부모 탈퇴: 동의 · 이력 함께 지워짐 · 파기 스키마 검사 통과

\set ON_ERROR_STOP 1
begin;

-- :MIGRATION

create temp table _r (n serial, ok boolean, label text);
create temp table _res (k text, v jsonb);
grant all on _r, _res to authenticated, service_role;
grant usage on sequence _r_n_seq to authenticated, service_role;

-- ── fixtures ─────────────────────────────────────────────────
-- 학원 A(스탠다드) · 학원 B. 학부모 1 · 2 · 3 은 학원 A 에 신청, 학부모 4 는 학원 B 에만 신청.
insert into public.organizations(id, name) values
  ('f1000000-0000-4000-8000-000000000001', '소식검증학원'),
  ('f1000000-0000-4000-8000-000000000002', '다른학원');
insert into public.organization_subscriptions(organization_id, plan_code, subscription_status, current_period_start, current_period_end)
values ('f1000000-0000-4000-8000-000000000001', 'standard', 'active', now() - interval '1 day', now() + interval '29 days');
insert into auth.users(id, email) values
  ('f2000000-0000-4000-8000-000000000001', 'acad-a@news.local'),
  ('f2000000-0000-4000-8000-000000000002', 'p1@news.local'),
  ('f2000000-0000-4000-8000-000000000003', 'p2@news.local'),
  ('f2000000-0000-4000-8000-000000000004', 'p3@news.local'),
  ('f2000000-0000-4000-8000-000000000005', 'p4@news.local');
insert into public.profiles(id, role, name, organization_id) values
  ('f2000000-0000-4000-8000-000000000001', 'academy', '원장', 'f1000000-0000-4000-8000-000000000001')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.profiles(id, role, name, phone) values
  ('f2000000-0000-4000-8000-000000000002', 'parent', '학부모1', '010-3000-0001'),
  ('f2000000-0000-4000-8000-000000000003', 'parent', '학부모2', '010-3000-0002'),
  ('f2000000-0000-4000-8000-000000000004', 'parent', '학부모3', '010-3000-0003'),
  ('f2000000-0000-4000-8000-000000000005', 'parent', '학부모4', '010-3000-0004')
on conflict (id) do update set role = 'parent', phone = excluded.phone;
insert into public.classes(id, organization_id, title, program_type, subject, target_age, description) values
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '로봇 코딩 체험', 'trial_class', 'coding', '초등', '검증'),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', '다른 학원 수업', 'trial_class', 'coding', '초등', '검증');
create temp table _slot as select ((date_trunc('day', now() at time zone 'Asia/Seoul') - interval '2 days' + interval '10 hours') at time zone 'Asia/Seoul') as recent;
insert into public.class_schedules(id, class_id, schedule_type, specific_date, start_time, end_time, capacity)
select v.id, v.class_id, 'one_time', (recent at time zone 'Asia/Seoul')::date, (recent at time zone 'Asia/Seoul')::time,
  ((recent + interval '1 hour') at time zone 'Asia/Seoul')::time, 10
from _slot, lateral (values
  ('f6000000-0000-4000-8000-000000000001'::uuid, 'f3000000-0000-4000-8000-000000000001'::uuid),
  ('f6000000-0000-4000-8000-000000000002'::uuid, 'f3000000-0000-4000-8000-000000000002'::uuid)) as v(id, class_id);
-- A1 학부모1 / A2 학부모2 / A3 학부모3 / B1 학부모4(학원 B)
insert into public.trial_applications(id, class_id, class_schedule_id, parent_id, child_name, child_grade, parent_name, parent_phone,
  requested_slot_at, confirmed_slot_at, completed_at, status, registration_status)
select v.id, v.class_id, v.schedule_id, v.parent_id, v.child_name, 'elem_4', '보호자', '010-9999-0000',
  _slot.recent, _slot.recent, _slot.recent + interval '1 hour', 'completed', 'not_enrolled'
from _slot, lateral (values
  ('f4000000-0000-4000-8000-000000000001'::uuid, 'f3000000-0000-4000-8000-000000000001'::uuid, 'f6000000-0000-4000-8000-000000000001'::uuid, 'f2000000-0000-4000-8000-000000000002'::uuid, '하람'),
  ('f4000000-0000-4000-8000-000000000002'::uuid, 'f3000000-0000-4000-8000-000000000001'::uuid, 'f6000000-0000-4000-8000-000000000001'::uuid, 'f2000000-0000-4000-8000-000000000003'::uuid, '서준'),
  ('f4000000-0000-4000-8000-000000000003'::uuid, 'f3000000-0000-4000-8000-000000000001'::uuid, 'f6000000-0000-4000-8000-000000000001'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, '지우'),
  ('f4000000-0000-4000-8000-000000000004'::uuid, 'f3000000-0000-4000-8000-000000000002'::uuid, 'f6000000-0000-4000-8000-000000000002'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, '도윤')
) as v(id, class_id, schedule_id, parent_id, child_name);

-- ── 1. 표 · 권한 ─────────────────────────────────────────────
insert into _r(ok, label) select relrowsecurity, '동의 표 RLS 켜짐' from pg_class where oid = 'public.parent_academy_news_consents'::regclass;
insert into _r(ok, label) select relrowsecurity, '이력 표 RLS 켜짐' from pg_class where oid = 'public.parent_academy_news_consent_events'::regclass;
insert into _r(ok, label)
select not has_table_privilege('authenticated', 'public.parent_academy_news_consents', 'insert')
  and not has_table_privilege('authenticated', 'public.parent_academy_news_consents', 'update')
  and not has_table_privilege('authenticated', 'public.parent_academy_news_consents', 'delete')
  and not has_table_privilege('authenticated', 'public.parent_academy_news_consent_events', 'insert')
  and not has_table_privilege('anon', 'public.parent_academy_news_consents', 'select'), '로그인 사용자는 동의 · 이력을 직접 못 쓴다(anon 은 못 읽는다)';
insert into _r(ok, label)
select has_column_privilege('authenticated', 'public.parent_academy_news_consents', 'consented', 'select')
  and has_column_privilege('authenticated', 'public.parent_academy_news_consents', 'consented_at', 'select')
  and not has_column_privilege('authenticated', 'public.parent_academy_news_consents', 'source', 'select')
  and not has_column_privilege('authenticated', 'public.parent_academy_news_consents', 'text_version', 'select'), '열 권한: 동의 여부 · 시각만(출처 · 문구 버전 비공개)';
insert into _r(ok, label)
select has_function_privilege('authenticated', 'public.set_my_academy_news_consent(boolean,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_my_academy_news_consent(boolean,text,text)', 'execute'), '동의 RPC 는 로그인만';
insert into _r(ok, label)
select not has_function_privilege('authenticated', 'public.withdraw_academy_news_consent_by_opt_out(uuid,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.withdraw_academy_news_consent_by_opt_out(uuid,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.withdraw_academy_news_consent_by_opt_out(uuid,timestamptz)', 'execute'), '080 철회 RPC 는 service role 만';

-- ── 2. 동의 RPC changed ──────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c1', public.set_my_academy_news_consent(false, 'parent_app', 'firstsuup-academy-news-2026-10');
insert into _res select 'c2', public.set_my_academy_news_consent(true, 'parent_app', 'firstsuup-academy-news-2026-10');
insert into _res select 'c3', public.set_my_academy_news_consent(true, 'parent_web', 'firstsuup-academy-news-2026-10');
insert into _res select 'c4', public.set_my_academy_news_consent(false, 'parent_web', 'firstsuup-academy-news-2026-10');
insert into _res select 'c5', public.set_my_academy_news_consent(false, 'parent_web', 'firstsuup-academy-news-2026-10');
insert into _res select 'c6', public.set_my_academy_news_consent(true, 'parent_app', ' firstsuup-academy-news-2026-10 ');
insert into _r(ok, label) select count(*) = 1 and bool_and(consented and consented_at is not null and withdrawn_at is null),
  '학부모 본인 행을 읽는다(동의 중)' from public.parent_academy_news_consents;
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean = false and not (v->>'consented')::boolean and v->>'withdrawnAt' is not null,
  '처음 보낸 거부(행 없음 → 거부) changed=false' from _res where k = 'c1';
insert into _r(ok, label) select (v->>'changed')::boolean and (v->>'consented')::boolean and v->>'withdrawnAt' is null, '거부 → 동의 changed=true · 철회 시각 지움' from _res where k = 'c2';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '동의 → 동의(같은 값) changed=false' from _res where k = 'c3';
insert into _r(ok, label) select (v->>'changed')::boolean and v->>'consentedAt' is not null, '동의 → 거부 changed=true · 마지막 동의 시각 유지' from _res where k = 'c4';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '거부 → 거부 changed=false' from _res where k = 'c5';
insert into _r(ok, label) select (v->>'changed')::boolean, '다시 동의 changed=true' from _res where k = 'c6';
insert into _r(ok, label) select (select array_agg(key order by key) from jsonb_object_keys(v) key) = array['changed', 'consentedAt', 'consented', 'withdrawnAt']::text[]
  or (select array_agg(key order by key) from jsonb_object_keys(v) key) = array['changed', 'consented', 'consentedAt', 'withdrawnAt']::text[],
  '응답 키: consented · consentedAt · withdrawnAt · changed(학원 id 없음)' from _res where k = 'c6';
insert into _r(ok, label) select text_version = 'firstsuup-academy-news-2026-10' and source = 'parent_app', '문구 버전은 앞뒤 공백을 떼고 남긴다 · 출처 기록'
  from public.parent_academy_news_consents where parent_id = 'f2000000-0000-4000-8000-000000000002';
insert into _r(ok, label) select count(*) = 6, '이력은 요청마다 남는다(6건)' from public.parent_academy_news_consent_events where parent_id = 'f2000000-0000-4000-8000-000000000002';
-- 처음 동의(행 없음 → 동의)
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c7', public.set_my_academy_news_consent(true, 'parent_app', 'v');
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean, '처음 동의(행 없음 → 동의) changed=true' from _res where k = 'c7';
insert into _r(ok, label)
select prosrc like '%pg_advisory_xact_lock(hashtextextended(''academy-news-consent:'' || v_uid::text, 0))%'
  and position('pg_advisory_xact_lock' in prosrc) < position('into v_previous' in prosrc),
  '이전 값을 읽기 전에 학부모 advisory lock'
from pg_proc where oid = 'public.set_my_academy_news_consent(boolean,text,text)'::regprocedure;

-- 입력 검사 · 학원 계정
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.set_my_academy_news_consent(true, 'opt_out_080', 'v');
  insert into _r(ok, label) values (false, '학부모가 080 출처로 썼다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'invalid_consent_source', '학부모는 앱 · 웹 출처만');
end $$;
do $$ begin
  perform public.set_my_academy_news_consent(true, 'parent_app', repeat('x', 61));
  insert into _r(ok, label) values (false, '문구 버전 61자를 받았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'invalid_consent_input', '문구 버전 1~60자');
end $$;
do $$ begin
  perform public.set_my_academy_news_consent(null, 'parent_app', 'v');
  insert into _r(ok, label) values (false, '동의 값 null 을 받았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'invalid_consent_input', '동의 값 null 거절');
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.set_my_academy_news_consent(true, 'parent_app', 'v');
  insert into _r(ok, label) values (false, '학원 계정이 동의를 썼다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'parent_required', '학원 계정은 동의를 못 쓴다');
end $$;
reset role;

-- 학부모 4: 학원 B 에만 신청, 동의
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c8', public.set_my_academy_news_consent(true, 'parent_app', 'v');
insert into _r(ok, label) select count(*) = 1, '학부모는 다른 학부모 동의를 못 본다(자기 1행만)' from public.parent_academy_news_consents;
insert into _r(ok, label) select count(*) = 1, '이력도 자기 것만' from public.parent_academy_news_consent_events;
reset role;

-- ── 3. 학원 읽기 범위 ────────────────────────────────────────
-- 지금: 학부모1 동의 · 학부모2 동의 · 학부모3 기록 없음 · 학부모4 동의(학원 B 학부모)
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(ok, label)
select array_agg(parent_id order by parent_id) = array['f2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000003']::uuid[],
  '학원 A 는 자기 학원에 신청한 학부모의 동의만 본다(학원 B 학부모 안 보임)'
from public.parent_academy_news_consents;
insert into _r(ok, label) select count(*) = 0, '학원은 이력을 못 본다' from public.parent_academy_news_consent_events;
reset role;

-- ── 4. 발송 자리 잡기: 단일 동의 ─────────────────────────────
-- 옛 학원별 동의만 있는 학부모3 은 빠진다(새 동의 없음). 시그니처 그대로 부른다.
insert into public.parent_marketing_consents(parent_id, organization_id, consented, consented_at, source, text_version)
values ('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', true, now(), 'parent_app', 'academy-marketing-2026-10');
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'b1', public.reserve_recontact_batch('f5000000-0000-4000-8000-000000000001',
  array['f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000003']::uuid[],
  'new_class', null, '{학생} 보호자님, 새 반이 열려요.', null, '080-123-4567', '010-8384-0825');
reset role;
insert into _r(ok, label) select (v->>'reserved')::int = 2 and (v->>'skipped')::int = 1, '단일 동의 2명만(옛 학원별 동의만 있는 학부모3 제외): ' || v::text from _res where k = 'b1';
insert into _r(ok, label) select sender_phone = '010-8384-0825', '발송 기록의 첫 줄 번호 = 첫수업 고객센터 번호'
  from public.recontact_batches where id = 'f5000000-0000-4000-8000-000000000001';
insert into _r(ok, label)
select array_agg(recipient_phone_masked order by recipient_phone_masked) = array['010-****-0001', '010-****-0002'], '받는 번호는 계정 번호'
from public.recontact_recipients where batch_id = 'f5000000-0000-4000-8000-000000000001';
-- 학원 B 의 신청은 학원 A 가 못 고른다(동의가 첫수업 하나여도)
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('f5000000-0000-4000-8000-000000000002', array['f4000000-0000-4000-8000-000000000004']::uuid[],
    'special', null, 'x', null, '080-123-4567', '010-8384-0825');
  insert into _r(ok, label) values (false, '다른 학원 신청에 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '다른 학원에 신청한 학부모는 동의해도 못 고른다');
end $$;
reset role;
-- 철회하면 빠진다
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c9', public.set_my_academy_news_consent(false, 'parent_app', 'v');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('f5000000-0000-4000-8000-000000000003', array['f4000000-0000-4000-8000-000000000002']::uuid[],
    'special', null, 'x', null, '080-123-4567', '010-8384-0825');
  insert into _r(ok, label) values (false, '철회한 학부모에게 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '철회한 학부모는 빠진다');
end $$;
reset role;
insert into _r(ok, label) select pg_get_function_identity_arguments('public.reserve_recontact_batch'::regproc) =
  'p_batch_id uuid, p_application_ids uuid[], p_template_kind text, p_class_id uuid, p_body_template text, p_link_url text, p_opt_out_number text, p_sender_phone text',
  '발송 RPC 시그니처 그대로(배포 전 Studio 코드 호환)';
insert into _r(ok, label) select prosrc not like '%parent_marketing_consents%' and prosrc like '%parent_academy_news_consents%',
  '발송 RPC 는 옛 학원별 동의를 더 읽지 않는다'
from pg_proc where oid = 'public.reserve_recontact_batch(uuid,uuid[],text,uuid,text,text,text,text)'::regprocedure;

-- ── 5. 080 철회 ──────────────────────────────────────────────
set local role service_role;
insert into _res select 'o1', public.withdraw_academy_news_consent_by_opt_out('f2000000-0000-4000-8000-000000000002', '2026-10-24T11:15:00Z');
insert into _res select 'o2', public.withdraw_academy_news_consent_by_opt_out('f2000000-0000-4000-8000-000000000002', '2026-10-24T11:15:00Z');
insert into _res select 'o3', public.withdraw_academy_news_consent_by_opt_out('f2000000-0000-4000-8000-000000000004', now());
insert into _res select 'o4', public.withdraw_academy_news_consent_by_opt_out('f2000000-0000-4000-8000-000000000005', now() + interval '1 day');
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean, '080: 동의 중 → 철회 changed=true' from _res where k = 'o1';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '080: 이미 철회면 그대로(멱등)' from _res where k = 'o2';
insert into _r(ok, label) select (v->>'changed')::boolean = false, '080: 기록 없는 학부모는 행을 만들지 않는다' from _res where k = 'o3';
insert into _r(ok, label) select not consented and source = 'opt_out_080' and text_version = 'opt-out-080' and withdrawn_at = '2026-10-24T11:15:00Z' and consented_at is not null,
  '080 철회: 출처 opt_out_080 · 철회 시각 = 080 등록 시각 · 마지막 동의 시각 유지'
from public.parent_academy_news_consents where parent_id = 'f2000000-0000-4000-8000-000000000002';
insert into _r(ok, label) select count(*) = 1, '080 철회 이력 1건(멱등 재호출은 이력 없음)'
  from public.parent_academy_news_consent_events where parent_id = 'f2000000-0000-4000-8000-000000000002' and source = 'opt_out_080' and action = 'withdraw';
insert into _r(ok, label) select not exists(select 1 from public.parent_academy_news_consents where parent_id = 'f2000000-0000-4000-8000-000000000004'), '080: 학부모3 행 없음 그대로';
insert into _r(ok, label) select withdrawn_at <= now(), '080: 미래 시각은 지금으로'
  from public.parent_academy_news_consents where parent_id = 'f2000000-0000-4000-8000-000000000005';
-- 080 뒤 다시 동의하면 동의로 바뀐다(번호 표가 발송은 계속 막는다)
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'c10', public.set_my_academy_news_consent(true, 'parent_app', 'v');
reset role;
insert into _r(ok, label) select (v->>'changed')::boolean, '080 철회 뒤 앱에서 다시 동의 changed=true' from _res where k = 'c10';
insert into public.marketing_opt_out_phones(phone_hash, source) values (app.recontact_phone_hash('01030000001'), 'opt_out_080');
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.reserve_recontact_batch('f5000000-0000-4000-8000-000000000004', array['f4000000-0000-4000-8000-000000000001']::uuid[],
    'special', null, 'x', null, '080-123-4567', '010-8384-0825');
  insert into _r(ok, label) values (false, '080 거부 번호에 자리를 잡았다');
exception when others then insert into _r(ok, label) values (sqlerrm = 'recontact_no_eligible_recipient', '다시 동의해도 080 거부 번호면 빠진다(번호 표 유지)');
end $$;
reset role;

-- ── 6. 처리 결과 알림 기록 ───────────────────────────────────
set local role service_role;
insert into public.marketing_consent_notices(parent_id, organization_id, action, source, occurred_at, status, recipient_phone_masked)
values ('f2000000-0000-4000-8000-000000000002', null, 'consent', 'parent_app', now(), 'dry_run', '010-****-0001');
insert into _r(ok, label) values (true, '앱 · 웹 알림은 학원 없이 기록한다');
insert into public.marketing_consent_notices(parent_id, organization_id, action, source, occurred_at, status)
values ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'consent', 'parent_web', now(), 'dry_run');
insert into _r(ok, label) values (true, '옛 학원별 알림 모양(학원 있음)도 그대로 들어간다(배포 전 코드)');
do $$ begin
  insert into public.marketing_consent_notices(parent_id, organization_id, action, source, phone_hash, occurred_at, status)
  values ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'withdraw', 'opt_out_080', repeat('c', 64), now(), 'sent');
  insert into _r(ok, label) values (false, '080 알림에 학원이 들어갔다');
exception when check_violation then insert into _r(ok, label) values (true, '080 알림은 학원 없이');
end $$;
do $$ begin
  insert into public.marketing_consent_notices(parent_id, action, source, occurred_at, status)
  values ('f2000000-0000-4000-8000-000000000002', 'withdraw', 'opt_out_080', now(), 'sent');
  insert into _r(ok, label) values (false, '080 알림에 번호 열쇠가 없다');
exception when check_violation then insert into _r(ok, label) values (true, '080 알림은 번호 열쇠가 있어야 한다');
end $$;
do $$ begin
  insert into public.marketing_consent_notices(parent_id, action, source, phone_hash, occurred_at, status)
  values ('f2000000-0000-4000-8000-000000000002', 'consent', 'parent_app', repeat('d', 64), now(), 'sent');
  insert into _r(ok, label) values (false, '앱 알림에 번호 열쇠가 들어갔다');
exception when check_violation then insert into _r(ok, label) values (true, '앱 · 웹 알림에는 번호 열쇠가 없다');
end $$;
reset role;

-- ── 7. 학부모 탈퇴 · 파기 ─────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _res select 'withdraw', to_jsonb(public.prepare_my_parent_account_deletion());
reset role;
insert into _r(ok, label) select v #>> '{}' = 'db_cleaned', '학부모 탈퇴가 끝까지 간다(db_cleaned)' from _res where k = 'withdraw';
insert into _r(ok, label) select count(*) = 0, '탈퇴: 학원 소식 동의 · 이력도 지워진다'
  from (select parent_id from public.parent_academy_news_consents where parent_id = 'f2000000-0000-4000-8000-000000000003'
        union all select parent_id from public.parent_academy_news_consent_events where parent_id = 'f2000000-0000-4000-8000-000000000003') x;
do $$ begin
  perform app.assert_trial_purge_schema();
  insert into _r(ok, label) values (true, '파기 스키마 검사(assert_trial_purge_schema) 통과');
exception when others then insert into _r(ok, label) values (false, '파기 스키마 검사 실패: ' || sqlerrm);
end $$;

select (case when ok then 'PASS' else 'FAIL' end) || '|' || label from _r order by n;
rollback;
select 'ROLLED_BACK|' || (not exists(select 1 from public.organizations where id = 'f1000000-0000-4000-8000-000000000001'));
