-- 학생 안내 문자 후속(2차-3 소수정).
--
-- 1. 받는 번호 = 학부모 계정 번호(profiles.phone, 010 휴대폰). 신청서 번호(trial_applications.parent_phone)는 쓰지 않는다.
--    안내 문자 · 동의 처리 결과 알림 · 080 처리 결과 알림이 모두 같은 번호로 간다. 계정 번호가 없으면 안내 대상에서 잠긴다.
-- 2. 동의 RPC 가 changed(상태가 실제로 바뀌었는가)를 돌려준다. 학부모 · 학원 advisory lock 안에서 판정해
--    처음 동의(행 없음)를 동시에 두 번 눌러도 changed = true 는 한 번이다.
-- 3. 처리 결과 알림 기록(marketing_consent_notices). 정보통신망법 제50조 제7항.
-- 4. 안내 문자 수신거부(opted_out) 상태 + NCP 결과 확인 열. 080 매일 동기화가 쓰는 조회 함수.
--
-- 바꾸지 않는 것: 동의 표 · 이력 표 · 080 번호 표의 구조, 월 한도 규칙(queued · sent 만 센다), 파기 흐름.
-- ⚠️ CLI 가 이 파일을 transaction 으로 감싸지 않으므로 set lock_timeout 같은 세션 설정을 두지 않는다.

-- ─────────────────────────────────────────────────────────────
-- 1. 학부모 계정 번호
-- ─────────────────────────────────────────────────────────────

-- 계정 번호(숫자만, 010 휴대폰). 학부모 계정이 아니거나 번호가 없으면 null.
create function app.recontact_account_phone(p_parent uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.d from (
    select app.normalized_parent_phone(p.phone) as d
    from public.profiles p
    where p.id = p_parent and p.role = 'parent'
  ) s
  where s.d ~ '^010[0-9]{8}$'
$$;
revoke all on function app.recontact_account_phone(uuid) from public, anon, authenticated;

-- 학생 목록 잠금("휴대폰 인증이 필요해요")용. 번호는 돌려주지 않고 준비된 학부모 id 만 돌려준다.
-- 이 학원에 신청한 적이 있는 학부모만 답한다.
create function public.list_studio_recontact_phone_ready(p_parent_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select distinct ta.parent_id
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id
  join public.profiles me on me.id = auth.uid() and me.role in ('academy', 'admin') and me.organization_id = c.organization_id
  where ta.parent_id = any(p_parent_ids)
    and app.recontact_account_phone(ta.parent_id) is not null
$$;
revoke all on function public.list_studio_recontact_phone_ready(uuid[]) from public, anon;
grant execute on function public.list_studio_recontact_phone_ready(uuid[]) to authenticated;

-- 080 동기화(service role): 거부 번호 해시 → 그 번호를 계정 번호로 쓰는 학부모.
create function public.find_recontact_parents_by_phone_hash(p_hashes text[])
returns table (phone_hash text, parent_id uuid)
language sql
stable
security definer
set search_path = public, app
as $$
  select h.phone_hash, h.parent_id
  from (
    select app.recontact_phone_hash(app.recontact_account_phone(p.id)) as phone_hash, p.id as parent_id
    from public.profiles p
    where p.role = 'parent'
  ) h
  where h.phone_hash = any(p_hashes)
$$;
revoke all on function public.find_recontact_parents_by_phone_hash(text[]) from public, anon, authenticated;
grant execute on function public.find_recontact_parents_by_phone_hash(text[]) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. 동의 RPC: changed
--
-- 20261024120000 원문에서 (1) 학부모 · 학원 advisory lock (2) 이전 값 읽기 (3) 반환의 changed 만 다르다.
-- 행이 없을 때는 for update 로 잠글 행이 없어 동시 요청 둘이 모두 "없음"을 볼 수 있다 → advisory lock 으로 줄을 세운다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_my_academy_marketing_consent(
  p_organization_id uuid,
  p_consented boolean,
  p_source text,
  p_text_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.parent_marketing_consents;
  v_previous boolean;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and role = 'parent') then
    raise exception 'parent_required' using errcode = '42501';
  end if;
  if p_source not in ('parent_app', 'parent_web') then raise exception 'invalid_consent_source'; end if;
  if p_consented is null or coalesce(btrim(p_text_version), '') = '' or char_length(p_text_version) > 60 then
    raise exception 'invalid_consent_input';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketing-consent:' || v_uid::text || ':' || p_organization_id::text, 0));

  -- 이전 값. 행이 없으면 null = 동의 안 함.
  select c.consented into v_previous
  from public.parent_marketing_consents c
  where c.parent_id = v_uid and c.organization_id = p_organization_id;

  insert into public.parent_marketing_consents as c
    (parent_id, organization_id, consented, consented_at, withdrawn_at, source, text_version, updated_at)
  values
    (v_uid, p_organization_id, p_consented,
     case when p_consented then v_now end, case when p_consented then null else v_now end,
     p_source, p_text_version, v_now)
  on conflict (parent_id, organization_id) do update set
    consented = excluded.consented,
    -- 다시 동의하면 동의 시각을 새로 찍고, 철회 시각은 지운다. 철회하면 마지막 동의 시각은 남긴다.
    consented_at = case when excluded.consented then v_now else c.consented_at end,
    withdrawn_at = case when excluded.consented then null else v_now end,
    source = excluded.source,
    text_version = excluded.text_version,
    updated_at = v_now
  returning * into v_row;

  insert into public.parent_marketing_consent_events (parent_id, organization_id, action, source, text_version, occurred_at)
  values (v_uid, p_organization_id, case when p_consented then 'consent' else 'withdraw' end, p_source, p_text_version, v_now);

  return jsonb_build_object(
    'organizationId', v_row.organization_id,
    'consented', v_row.consented,
    'consentedAt', v_row.consented_at,
    'withdrawnAt', v_row.withdrawn_at,
    -- 없음 → 동의, 동의 → 거부, 거부 → 동의만 true. 처리 결과 알림은 이 값으로만 보낸다.
    'changed', coalesce(v_previous, false) is distinct from p_consented
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. 처리 결과 알림 기록
--
-- sms_logs 를 쓰지 않는 이유
--   - organization_id NOT NULL · 신청 단위다. 080 거부는 학원이 없다(모든 학원).
--   - 학원이 자기 학원 sms_logs 를 읽는다 → "이 학원 안내를 거부했어요" 문자 내용이 학원에 보인다.
--   - 학부모 탈퇴 때 지워지지 않는다.
-- 학원 · 학부모 누구도 직접 읽지 않는다(service role 만). 학부모 탈퇴 시 함께 지워진다.
--
-- 080 알림은 번호마다 한 번: 보내기 전에 claimed 로 자리를 잡는다(partial unique).
-- sent · skipped 는 자리를 지킨다. failed · dry_run 은 자리를 비워 다음 동기화에서 다시 시도한다
-- (로컬 · 문자 꺼짐의 dry_run 이 운영의 실제 발송을 막지 않게 — 10-23 organization_billing_notices 와 같은 규칙).
-- ─────────────────────────────────────────────────────────────

create table public.marketing_consent_notices (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  -- null = 080 거부(모든 학원)
  organization_id uuid references public.organizations(id) on delete cascade,
  action text not null check (action in ('consent', 'withdraw')),
  source text not null check (source in ('parent_app', 'parent_web', 'opt_out_080', 'admin')),
  -- 080 알림의 번호마다 한 번 열쇠. 앱 · 웹 알림은 null.
  phone_hash text check (phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$'),
  -- 문자에 적은 처리 날짜의 원본 시각
  occurred_at timestamptz not null,
  status text not null check (status in ('claimed', 'sent', 'dry_run', 'failed', 'skipped')),
  recipient_phone_masked text check (recipient_phone_masked is null or recipient_phone_masked ~ '\*'),
  provider_message_id text,
  -- 실패 · 건너뜀 이유 코드(local_guard · parent_phone_missing · ncloud_… 등). 번호 · 이름은 넣지 않는다.
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint marketing_consent_notices_080_check
    check ((source = 'opt_out_080') = (organization_id is null) and (source = 'opt_out_080') = (phone_hash is not null))
);

comment on table public.marketing_consent_notices is
  '광고성 정보 수신 동의 · 철회 처리 결과 알림(정보통신망법 제50조 제7항) 발송 기록. service role 전용.';

create unique index marketing_consent_notices_080_once_uidx
  on public.marketing_consent_notices (phone_hash)
  where source = 'opt_out_080' and status in ('claimed', 'sent', 'skipped');
create index marketing_consent_notices_parent_idx on public.marketing_consent_notices (parent_id, created_at desc);

alter table public.marketing_consent_notices enable row level security;
revoke all on table public.marketing_consent_notices from public, anon, authenticated;
grant select, insert, update on table public.marketing_consent_notices to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. 안내 문자: 수신거부로 발송 안 됨 · NCP 결과 확인
--
-- 발송 요청은 NCP 가 받으면 성공(202)이다. 080 거부 번호는 NCP 가 광고 문자에서 걸러 수신 결과가 fail 로 온다.
-- 매일 동기화가 메시지 결과 조회로 확인해, fail 이면서 080 거부 목록에 있는 번호는 opted_out, 그 밖의 fail 은 failed 로 바꾼다.
-- 한도(get_recontact_month_usage · reserve)는 queued · sent 만 세므로 opted_out · failed 는 한도에서 빠진다.
-- 화면(연락 기록 "수신거부로 발송 안 됨")은 status 만 읽는다. 새 열은 학원에 열지 않는다(column grant 그대로).
-- ─────────────────────────────────────────────────────────────

alter table public.recontact_recipients drop constraint recontact_recipients_status_check;
alter table public.recontact_recipients add constraint recontact_recipients_status_check
  check (status in ('queued', 'sent', 'failed', 'dry_run', 'opted_out'));
alter table public.recontact_recipients add column provider_result_code text;
alter table public.recontact_recipients add column result_checked_at timestamptz;

create index recontact_recipients_result_pending_idx
  on public.recontact_recipients (created_at)
  where status = 'sent' and result_checked_at is null;

-- ─────────────────────────────────────────────────────────────
-- 5. 발송 자리 잡기: 계정 번호로 고른다
--
-- 20261024120000 원문에서 받는 번호 식(ta.parent_phone → app.recontact_account_phone(ta.parent_id))만 다르다.
-- 계정 번호가 없는 학생은 빠진다(skipped). 080 거부 · 같은 번호 하나 규칙도 계정 번호로 본다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.reserve_recontact_batch(
  p_batch_id uuid,
  p_application_ids uuid[],
  p_template_kind text,
  p_class_id uuid,
  p_body_template text,
  p_link_url text,
  p_opt_out_number text,
  p_sender_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_org uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_used integer;
  v_limit constant integer := 200;
  v_per_batch constant integer := 50;
  v_eligible integer;
  v_recipients jsonb;
begin
  select p.organization_id into v_org from public.profiles p
  where p.id = auth.uid() and p.role in ('academy', 'admin');
  if v_org is null then raise exception 'studio_required' using errcode = '42501'; end if;

  if not app.organization_can_send_recontact(v_org) then
    raise exception 'recontact_plan_required' using errcode = '42501';
  end if;

  if exists (select 1 from public.recontact_batches where id = p_batch_id) then
    if not exists (select 1 from public.recontact_batches where id = p_batch_id and organization_id = v_org) then
      raise exception 'recontact_batch_conflict';
    end if;
    return jsonb_build_object('mode', 'duplicate', 'batchId', p_batch_id);
  end if;

  if coalesce(array_length(p_application_ids, 1), 0) = 0 or array_length(p_application_ids, 1) > v_per_batch then
    raise exception 'recontact_recipient_count_invalid';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.classes where id = p_class_id and organization_id = v_org
  ) then raise exception 'recontact_class_forbidden'; end if;

  perform pg_advisory_xact_lock(hashtextextended('recontact:' || v_org::text, 0));

  select count(*) into v_used from public.recontact_recipients
  where organization_id = v_org and created_at >= v_month_start and status in ('queued', 'sent');

  -- 같은 transaction 에서 두 번 불려도 되게(중복 클릭 재시도 등) 먼저 지운다.
  drop table if exists pg_temp._recontact_pick;
  create temporary table _recontact_pick on commit drop as
  select distinct on (x.phone_hash)
    x.application_id,
    x.phone_hash,
    regexp_replace(x.phone, '^(\d{3})\d+(\d{4})$', '\1-****-\2') as phone_masked
  from (
    select ta.id as application_id, ta.created_at,
      app.recontact_account_phone(ta.parent_id) as phone,
      app.recontact_phone_hash(app.recontact_account_phone(ta.parent_id)) as phone_hash
    from public.trial_applications ta
    join public.classes c on c.id = ta.class_id and c.organization_id = v_org
    join public.parent_marketing_consents mc
      on mc.parent_id = ta.parent_id and mc.organization_id = v_org and mc.consented
    where ta.id = any(p_application_ids)
      and ta.privacy_erased_at is null
      and ta.parent_id is not null
  ) x
  where x.phone_hash is not null
    and not exists (select 1 from public.marketing_opt_out_phones o where o.phone_hash = x.phone_hash)
  order by x.phone_hash, x.created_at desc;

  select count(*) into v_eligible from _recontact_pick;
  if v_eligible = 0 then raise exception 'recontact_no_eligible_recipient'; end if;
  if v_used + v_eligible > v_limit then
    return jsonb_build_object('mode', 'limit_exceeded', 'used', v_used, 'limit', v_limit, 'requested', v_eligible);
  end if;

  insert into public.recontact_batches (id, organization_id, created_by, template_kind, class_id, body_template,
    link_url, opt_out_number, sender_phone, requested_count, reserved_count)
  values (p_batch_id, v_org, auth.uid(), p_template_kind, p_class_id, p_body_template, p_link_url, p_opt_out_number,
    p_sender_phone, array_length(p_application_ids, 1), v_eligible);

  with inserted as (
    insert into public.recontact_recipients (batch_id, organization_id, application_id, phone_hash, recipient_phone_masked)
    select p_batch_id, v_org, application_id, phone_hash, phone_masked from _recontact_pick
    returning id, application_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('recipientId', id, 'applicationId', application_id)), '[]'::jsonb)
  into v_recipients from inserted;

  return jsonb_build_object('mode', 'reserved', 'batchId', p_batch_id, 'reserved', v_eligible,
    'skipped', array_length(p_application_ids, 1) - v_eligible, 'used', v_used + v_eligible, 'limit', v_limit,
    'recipients', v_recipients);
end;
$$;

notify pgrst, 'reload schema';
