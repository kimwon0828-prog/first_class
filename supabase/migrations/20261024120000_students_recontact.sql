-- 2차-3 학생 메뉴 + 안내 보내기(다시 연락 문자)
--
--   1. parent_marketing_consents · _events   광고성 정보 수신 동의(학부모 × 학원) — 현재 상태 + 이력
--   2. marketing_opt_out_phones              080 무료수신거부로 들어온 번호(전 학원 공통 차단)
--   3. set_studio_next_contact()             다음 연락(메모 + 날짜) — trial_applications.next_contact_at · follow_up_note 재사용
--   4. recontact_batches · recontact_recipients  안내 발송 1건 + 받는 사람별 결과
--   5. reserve_recontact_batch()             월 200건 한도 · 동의 · 중복 클릭을 한 transaction 에서 판정하고 자리를 잡는다
--   6. 개인정보 파기(20261022120000)에 recontact_recipients 를 편입 — 학부모 탈퇴 · 보관기간 파기가 멈추지 않게
--
-- 바꾸지 않는 것
--   - trial_applications 에 열을 더하지 않는다. 파기 함수(app.clear_trial_private_fields)가 모든 비보관 열을
--     NULL 로 지우고, 새 NOT NULL 열이 있으면 실패한다 — 열을 늘리면 파기 계약을 다시 검토해야 한다.
--   - 기존 RPC(record_studio_contact 등) · sms_logs 계약은 그대로다.
--
-- CLI 가 파일 하나를 transaction 으로 감싸므로 begin / commit 을 쓰지 않는다(20261022120000 과 같다).

set local lock_timeout='5s';
set local statement_timeout='60s';

-- ─────────────────────────────────────────────────────────────
-- 1. 광고성 정보 수신 동의 (학부모 × 학원)
--
-- 정보통신망법 제50조: 광고성 정보는 수신자의 사전 동의가 있어야 보낸다. 동의는 학원마다 따로 받는다
-- (A 학원 동의가 B 학원 광고 허락이 아니다). 엑셀로 가져온 신청은 학부모 계정이 없어 동의를 받을 수 없다
-- — 그 학생은 안내 대상에서 잠긴다.
--
-- 현재 상태는 (parent_id, organization_id) 한 행, 바뀐 이력은 events 에 append-only 로 남긴다.
-- 쓰기는 학부모 본인 RPC(set_my_academy_marketing_consent) · 080 수신거부 처리(service role)만 한다.
-- ─────────────────────────────────────────────────────────────

create table public.parent_marketing_consents (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  consented boolean not null,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  -- 마지막으로 상태를 바꾼 경로
  source text not null,
  -- 동의 화면 문구 버전(예: 'academy-marketing-2026-10'). 문구가 바뀌면 다시 받을지 판단하는 근거다.
  text_version text not null,
  updated_at timestamptz not null default now(),
  primary key (parent_id, organization_id),
  constraint parent_marketing_consents_source_check
    check (source in ('parent_app', 'parent_web', 'opt_out_080', 'admin')),
  constraint parent_marketing_consents_state_check
    check ((consented and consented_at is not null) or (not consented and withdrawn_at is not null))
);

comment on table public.parent_marketing_consents is
  '광고성 정보(안내 문자) 수신 동의. 학부모 × 학원 한 행. 쓰기는 RPC/서버만, 학원은 자기 학원 행만 읽는다.';

create index parent_marketing_consents_org_idx on public.parent_marketing_consents (organization_id) where consented;

create table public.parent_marketing_consent_events (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('consent', 'withdraw')),
  source text not null check (source in ('parent_app', 'parent_web', 'opt_out_080', 'admin')),
  text_version text not null,
  occurred_at timestamptz not null default now()
);

comment on table public.parent_marketing_consent_events is
  '수신 동의 · 철회 이력(append-only). 동의 증빙. 학부모 탈퇴 시 profiles cascade 로 함께 지워진다.';

alter table public.parent_marketing_consents enable row level security;
alter table public.parent_marketing_consent_events enable row level security;
revoke all on table public.parent_marketing_consents from anon, authenticated;
revoke all on table public.parent_marketing_consent_events from anon, authenticated;

-- 읽기: 학부모 본인 행 · 학원은 자기 학원 행(동의 여부 · 시각만, 출처 · 문구 버전은 보이지 않는다)
grant select (parent_id, organization_id, consented, consented_at, withdrawn_at)
  on public.parent_marketing_consents to authenticated;
grant select on public.parent_marketing_consent_events to authenticated;

create policy parent_marketing_consents_parent_select on public.parent_marketing_consents
  for select to authenticated using (parent_id = auth.uid());
create policy parent_marketing_consents_studio_select on public.parent_marketing_consents
  for select to authenticated using (
    app.current_org_id() is not null
    and organization_id = app.current_org_id()
    and app.current_role() in ('teacher', 'operator')
  );
create policy parent_marketing_consent_events_parent_select on public.parent_marketing_consent_events
  for select to authenticated using (parent_id = auth.uid());

-- 학부모 본인 동의 · 철회(학부모 앱 · 웹 공용)
create function public.set_my_academy_marketing_consent(
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
    'withdrawnAt', v_row.withdrawn_at
  );
end;
$$;

revoke all on function public.set_my_academy_marketing_consent(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_my_academy_marketing_consent(uuid, boolean, text, text) to authenticated;

create function public.list_my_academy_marketing_consents()
returns table (organization_id uuid, organization_name text, consented boolean, consented_at timestamptz, withdrawn_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.organization_id, o.name, c.consented, c.consented_at, c.withdrawn_at
  from public.parent_marketing_consents c
  join public.organizations o on o.id = c.organization_id
  where c.parent_id = auth.uid()
  order by c.updated_at desc
$$;

revoke all on function public.list_my_academy_marketing_consents() from public, anon;
grant execute on function public.list_my_academy_marketing_consents() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. 080 무료수신거부 번호
--
-- 080 번호는 첫수업 하나를 모든 학원이 같이 쓴다 → 어느 학원 광고에 대한 거부인지 알 수 없다.
-- 그래서 거부한 번호는 모든 학원 안내에서 뺀다(가장 보수적). 원번호는 저장하지 않고 sha256(숫자만)만 둔다.
-- 080 사업자 목록을 받아 넣는 것은 운영 작업(service role)이다.
-- ─────────────────────────────────────────────────────────────

create table public.marketing_opt_out_phones (
  phone_hash text primary key check (phone_hash ~ '^[0-9a-f]{64}$'),
  opted_out_at timestamptz not null default now(),
  source text not null check (source in ('opt_out_080', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.marketing_opt_out_phones enable row level security;
revoke all on table public.marketing_opt_out_phones from anon, authenticated;
grant all on table public.marketing_opt_out_phones to service_role;

create function app.recontact_phone_hash(p_phone text) returns text
language sql immutable set search_path = public, extensions as $$
  select case when coalesce(regexp_replace(p_phone, '\D', '', 'g'), '') = '' then null
    else encode(extensions.digest(regexp_replace(p_phone, '\D', '', 'g'), 'sha256'), 'hex') end
$$;
revoke all on function app.recontact_phone_hash(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. 다음 연락(메모 + 날짜)
--
-- 새 열을 만들지 않고 trial_applications.next_contact_at · follow_up_note 를 그대로 쓴다.
--   - next_contact_at 은 이미 Case 파이프라인(오늘 연락 · 지난 연락)이 읽는 값이다.
--   - follow_up_note 는 지금 쓰는 화면이 없는 빈 열이다(메모 자리로 쓴다).
--   - 두 열 모두 파기 보관 목록(keep)에 없어 개인정보 파기 때 함께 지워진다.
-- 학생의 "대표 신청"(가장 최근 신청)에 저장한다. 학원에게 문자를 보내지 않는다 — 그 날 홈 "오늘 할 일"에만 뜬다.
-- record_studio_contact 는 상담 기록(consultation_logs)을 함께 남기고 완료된 신청만 받으므로 쓰지 않는다.
-- ─────────────────────────────────────────────────────────────

create function public.set_studio_next_contact(p_application_id uuid, p_next_contact_on date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
  v_at timestamptz;
begin
  select ta.id into v_id
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id
  join public.profiles p on p.id = auth.uid() and p.organization_id = c.organization_id
  where ta.id = p_application_id and p.role in ('academy', 'admin')
  for update of ta;
  if v_id is null then raise exception 'application_not_found_or_forbidden'; end if;

  if p_note is not null and char_length(btrim(p_note)) > 200 then raise exception 'invalid_next_contact_note'; end if;
  if (p_next_contact_on is null) <> (nullif(btrim(coalesce(p_note, '')), '') is null) then
    -- 날짜와 메모는 함께 저장하거나 함께 지운다.
    raise exception 'invalid_next_contact';
  end if;

  -- 날짜만 받는다. 그 날 KST 09:00 으로 저장한다(오늘 할 일 판정은 KST 날짜로 한다).
  v_at := case when p_next_contact_on is null then null
    else (p_next_contact_on::timestamp + interval '9 hours') at time zone 'Asia/Seoul' end;

  update public.trial_applications
  set next_contact_at = v_at,
      follow_up_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('applicationId', v_id, 'nextContactAt', v_at);
end;
$$;

revoke all on function public.set_studio_next_contact(uuid, date, text) from public, anon;
grant execute on function public.set_studio_next_contact(uuid, date, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. 안내 발송 기록
--
-- batch      학원이 [N명에게 보내기]를 한 번 누른 것. id 는 화면이 만든 submission id(중복 클릭 방지).
--            본문은 치환 전 템플릿({학생} · {수업} 자리 표시)만 저장한다 — 학생 이름이 들어간 완성 문장은 남기지 않는다.
-- recipient  받는 사람 한 명. 원번호 대신 마스킹 번호 · 해시만 둔다. 학생 상세 "연락 기록"이 이 행을 읽는다.
-- ─────────────────────────────────────────────────────────────

create table public.recontact_batches (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  template_kind text not null check (template_kind in ('new_class', 'special', 'schedule_change', 'custom')),
  class_id uuid references public.classes(id) on delete set null,
  body_template text not null check (char_length(body_template) between 1 and 1000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  opt_out_number text not null check (opt_out_number ~ '^080-?[0-9]{3,4}-?[0-9]{4}$'),
  -- 첫 줄 "(광고) [학원명] 학원대표번호"(정보통신망법 전송자 명칭 · 연락처)의 번호. 보낸 때의 값을 남긴다.
  sender_phone text not null check (char_length(regexp_replace(sender_phone, '\D', '', 'g')) between 8 and 12),
  requested_count integer not null check (requested_count between 1 and 50),
  reserved_count integer not null default 0,
  status text not null default 'reserved' check (status in ('reserved', 'sending', 'done')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index recontact_batches_org_created_idx on public.recontact_batches (organization_id, created_at desc);

create table public.recontact_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recontact_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 대표 신청. 파기(app.erase_trial_private_payload)가 이 행을 지운다 — 아래 6 참고.
  application_id uuid not null references public.trial_applications(id) on delete cascade,
  -- 학부모 계정은 두지 않는다(신청이 이미 가리킨다). 학부모 탈퇴가 profiles 를 지울 때 이 표를 다시 건드리지 않게.
  phone_hash text not null,
  recipient_phone_masked text check (recipient_phone_masked is null or recipient_phone_masked ~ '\*'),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'dry_run')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- 같은 번호에는 한 번 누를 때 한 통만 간다(형제가 함께 골라져도).
  unique (batch_id, phone_hash)
);

create index recontact_recipients_org_month_idx on public.recontact_recipients (organization_id, created_at);
create index recontact_recipients_application_idx on public.recontact_recipients (application_id, created_at desc);

alter table public.recontact_batches enable row level security;
alter table public.recontact_recipients enable row level security;
revoke all on table public.recontact_batches from anon, authenticated;
revoke all on table public.recontact_recipients from anon, authenticated;
grant select on table public.recontact_batches to authenticated;
grant select (id, batch_id, organization_id, application_id, recipient_phone_masked, status, created_at, sent_at)
  on public.recontact_recipients to authenticated;
grant all on table public.recontact_batches, public.recontact_recipients to service_role;

create policy recontact_batches_studio_select on public.recontact_batches for select to authenticated using (
  app.current_org_id() is not null and organization_id = app.current_org_id() and app.current_role() in ('teacher', 'operator'));
create policy recontact_recipients_studio_select on public.recontact_recipients for select to authenticated using (
  app.current_org_id() is not null and organization_id = app.current_org_id() and app.current_role() in ('teacher', 'operator'));

-- ─────────────────────────────────────────────────────────────
-- 5. 발송 자리 잡기 — 요금제 · 월 한도 · 동의 · 중복 클릭
--
-- 한 transaction 안에서
--   1) 학원 계정 확인(auth.uid() → 조직)
--   2) 스탠다드 확인 — 서버 액션의 entitlement 확인과 이중이다. 판정은 기존 SQL(organization_has_paid_access)과
--      내부 전체 권한(organization_entitlement_overrides)을 그대로 쓴다(TS resolveStudioEntitlements 와 같은 두 입력).
--   3) 같은 batch id 가 있으면 아무것도 하지 않고 그대로 알린다(중복 클릭 · 재시도 — 다시 보내지 않는다)
--   4) 조직 단위 advisory lock — 두 탭이 동시에 눌러도 한도가 넘지 않는다
--   5) 받는 사람을 서버가 다시 고른다: 신청이 이 학원 것 · 파기 안 됨 · 번호 있음 ·
--      학부모 계정 있음 + 이 학원 동의 중 · 080 거부 번호 아님 · 같은 번호는 하나
--   6) 이번 달(KST) 사용량 + 이번 인원 ≤ 200 이면 queued 로 넣는다. 넘으면 아무것도 넣지 않고 거절한다
-- 클라이언트가 보낸 전화번호 · 동의 여부는 받지 않는다(신청 id 만 받는다).
-- 실제 발송 · 결과 기록은 서버(service role)가 한다. failed · dry_run 은 한도에서 빠진다.
-- ─────────────────────────────────────────────────────────────

create function app.organization_can_send_recontact(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.organization_subscriptions s
    where s.organization_id = p_org
      and s.plan_code in ('standard', 'pro')
      and public.organization_has_paid_access(s.subscription_status, s.current_period_end, s.grace_period_end)
  ) or exists (
    select 1 from public.organization_entitlement_overrides o
    where o.organization_id = p_org
      and o.full_access
      and (o.expires_at is null or o.expires_at > now())
  )
$$;

revoke all on function app.organization_can_send_recontact(uuid) from public, anon, authenticated;

create function public.reserve_recontact_batch(
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
  select distinct on (app.recontact_phone_hash(ta.parent_phone))
    ta.id as application_id,
    app.recontact_phone_hash(ta.parent_phone) as phone_hash,
    regexp_replace(regexp_replace(ta.parent_phone, '\D', '', 'g'), '^(\d{3})\d+(\d{4})$', '\1-****-\2') as phone_masked
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id and c.organization_id = v_org
  join public.parent_marketing_consents mc
    on mc.parent_id = ta.parent_id and mc.organization_id = v_org and mc.consented
  where ta.id = any(p_application_ids)
    and ta.privacy_erased_at is null
    and ta.parent_id is not null
    and app.recontact_phone_hash(ta.parent_phone) is not null
    and not exists (select 1 from public.marketing_opt_out_phones o where o.phone_hash = app.recontact_phone_hash(ta.parent_phone))
  order by app.recontact_phone_hash(ta.parent_phone), ta.created_at desc;

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

revoke all on function public.reserve_recontact_batch(uuid, uuid[], text, uuid, text, text, text, text) from public, anon;
grant execute on function public.reserve_recontact_batch(uuid, uuid[], text, uuid, text, text, text, text) to authenticated;

-- 이번 달 사용량(화면 "남은 발송 182 / 200건")
create function public.get_recontact_month_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select jsonb_build_object('used', count(*), 'limit', 200)
  from public.recontact_recipients r
  where r.organization_id = app.current_org_id()
    and r.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    and r.status in ('queued', 'sent')
$$;

revoke all on function public.get_recontact_month_usage() from public, anon;
grant execute on function public.get_recontact_month_usage() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. 개인정보 파기(20261022120000)에 편입
--
-- recontact_recipients 는 trial_applications 를 참조한다. assert_trial_purge_schema 는 검토하지 않은 참조가
-- 있으면 파기를 멈춘다(학부모 탈퇴 · 12개월 보관 파기 모두). 그래서 같은 migration 에서
--   - 허용 목록에 recontact_recipients(application_id)를 더하고
--   - erase_trial_private_payload 가 그 행을 지우게 하고
--   - 파기된 신청에 새로 쓰지 못하게 같은 guard trigger 를 단다.
-- 아래 두 함수는 20261022120000 원문을 그대로 옮기고 표시한 한 줄씩만 더했다(본문 생성 스크립트로 비교).
-- ─────────────────────────────────────────────────────────────

create trigger privacy_erased_trial_write before insert or update or delete on public.recontact_recipients
  for each row execute function app.guard_erased_trial_write();

create or replace function app.erase_trial_private_payload(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.trial_applications;p_parent uuid;mode text;
begin
 select * into a from public.trial_applications where id=p_id for update;
 if not app.privacy_erasure_active(p_id) then raise exception 'privacy_context_required';end if;
 if a.privacy_erased_at is not null then return;end if;
 select c.actor_parent_id,c.mode into p_parent,mode from app.privacy_erasure_context c where c.application_id=p_id;
 -- Production upload route has maxDuration=60. A ten-minute uploading window
 -- is protected from erasure; failures remain retryable, never completed early.
 if exists(select 1 from public.report_attachment_files f where f.application_id=p_id
  and f.state='uploading' and f.created_at>now()-interval '10 minutes') then
  raise exception 'privacy_upload_in_progress';
 end if;
 if exists(select 1 from app.trial_privacy_holds h where h.application_id=p_id and h.retain_until>now()) then
  raise exception 'privacy_hold_review_required';
 end if;
 if exists(select 1 from public.report_attachment_files f join public.experience_reports r
  on r.application_id<>p_id and r.content->'attachments' @> jsonb_build_array(jsonb_build_object('id',f.id::text))
  where f.application_id=p_id)
 or exists(select 1 from public.report_attachment_files f join public.trial_results r on r.application_id<>p_id
 and r.attachments @> jsonb_build_array(jsonb_build_object('id',f.id::text)) where f.application_id=p_id)
 then raise exception 'privacy_shared_file_review_required'; end if;
 insert into app.erased_trial_metrics(application_id,had_published_report)
 select p_id,exists(select 1 from public.experience_reports r where r.application_id=p_id and r.status='published')
 on conflict(application_id) do nothing;
 if mode='withdrawal' then
  insert into app.parent_erasure_trials(parent_id,application_id) values(p_parent,p_id) on conflict do nothing;
  insert into app.parent_erasure_files(parent_id,bucket_id,object_name)
  select p_parent,'report-attachments',f.object_path from public.report_attachment_files f where f.application_id=p_id on conflict do nothing;
 else
  insert into app.trial_retention_files(application_id,bucket_id,object_name)
  select p_id,'report-attachments',f.object_path from public.report_attachment_files f where f.application_id=p_id on conflict do nothing;
 end if;
 if exists(select 1 from pg_attribute where attrelid='public.parent_notification_reads'::regclass and attname='notification_key' and not attisdropped) then
  execute 'delete from public.parent_notification_reads n where n.notification_key in (select ''status:''||id::text from public.application_logs where application_id=$1 union select ''report_published:''||id::text from public.experience_reports where application_id=$1 union select notification_key from public.parent_event_push_deliveries where application_id=$1)' using p_id;
 end if;
 if to_regclass('public.parent_confirmed_push_deliveries') is not null then
  execute 'delete from public.parent_confirmed_push_deliveries where application_id=$1' using p_id;
 end if;
 delete from public.parent_report_engagement where application_id=p_id;
 delete from public.experience_feedback where application_id=p_id;
 delete from public.parent_decisions where application_id=p_id;
 delete from public.experience_reports where application_id=p_id;
 delete from public.trial_results where application_id=p_id;
 delete from public.studio_academy_memos where application_id=p_id;
 delete from public.consultation_logs where application_id=p_id;
 delete from public.report_attachment_files where application_id=p_id;
 delete from public.studio_import_rows where application_id=p_id;
 -- 2차-3: 안내 보내기 받는 사람 기록(마스킹 번호 · 상태)도 함께 지운다.
 delete from public.recontact_recipients where application_id=p_id;
 update public.application_logs set note=null,actor_id=case when actor_id=p_parent or exists(select 1 from public.profiles p where p.id=actor_id and p.role='parent') then null else actor_id end where application_id=p_id;
 update public.sms_logs set recipient_name=null,recipient_phone_masked=null,message_preview=null,
  provider_message_id=null,error_message=null where trial_application_id=p_id;
 if exists(select 1 from pg_attribute where attrelid='public.sms_logs'::regclass and attname='created_by' and not attisdropped) then
  execute 'update public.sms_logs s set created_by=null where s.trial_application_id=$1 and exists(select 1 from public.profiles p where p.id=s.created_by and p.role=''parent'')' using p_id;
 end if;
 delete from public.parent_event_push_deliveries where application_id=p_id;
 perform app.clear_trial_private_fields(p_id);
end $$;
revoke all on function app.erase_trial_private_payload(uuid) from public,anon,authenticated,service_role;

create or replace function app.assert_trial_purge_schema() returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='public.trial_applications'::regclass
   and not ((n.nspname||'.'||t.relname)=any(array[
    'public.trial_results','public.experience_reports','public.experience_feedback','public.parent_decisions',
    'public.parent_report_engagement','public.studio_academy_memos','public.consultation_logs','public.application_logs',
    'public.registration_results','public.report_attachment_files','public.sms_logs','public.studio_import_rows',
    'public.parent_event_push_deliveries','public.parent_confirmed_push_deliveries','public.schedule_blocks',
    'public.recontact_recipients',
    'app.trial_privacy_holds','app.erased_trial_metrics','app.trial_retention_jobs','app.parent_erasure_trials'])
    and cardinality(c.conkey)=1 and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[1])=
     case when t.relname='sms_logs' then 'trial_application_id' when t.relname='schedule_blocks' then 'related_application_id' else 'application_id' end))
 then raise exception 'privacy_reference_schema_review_required';end if;
 -- Child-row deletion must not silently cascade into an unreviewed table either.
 if exists(select 1 from pg_constraint c join pg_class target on target.oid=c.confrelid join pg_namespace tn on tn.oid=target.relnamespace
  join pg_class source on source.oid=c.conrelid join pg_namespace sn on sn.oid=source.relnamespace
  where c.contype='f' and tn.nspname='public'
   and target.relname=any(array['trial_results','experience_reports','experience_feedback','parent_decisions','parent_report_engagement',
    'studio_academy_memos','consultation_logs','application_logs','registration_results','report_attachment_files','sms_logs',
    'studio_import_rows','parent_event_push_deliveries','parent_confirmed_push_deliveries','schedule_blocks','recontact_recipients'])
   and not(sn.nspname='public' and cardinality(c.conkey)=1 and (
    (target.relname='application_logs' and source.relname='parent_confirmed_push_deliveries' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1])='id')
    or (target.relname='experience_reports' and source.relname='parent_report_engagement' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1])='first_report_id')
    or (target.relname='schedule_blocks' and source.relname='trial_applications' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1]) in ('requested_schedule_block_id','confirmed_schedule_block_id')))))
 then raise exception 'privacy_reference_schema_review_required';end if;
end $$;
revoke all on function app.assert_trial_purge_schema() from public,anon,authenticated,service_role;

-- 사후 검증: 파기 허용 목록이 새 참조를 받아들인다.
do $$ begin perform app.assert_trial_purge_schema(); end $$;

notify pgrst, 'reload schema';
