-- 학원 소식(광고성 문자) 수신 동의를 첫수업 하나로.
--
-- 학원 소식은 첫수업이 보내는 주체다(대표 결정 2026-10-25). 동의도 학원마다가 아니라 첫수업에 한 번 받는다.
--
--   1. parent_academy_news_consents · _events   학부모 1행(현재 상태) + 이력(append-only)
--   2. set_my_academy_news_consent()            학부모 본인 동의 · 철회(changed + advisory lock, 20261025120000 과 같은 방식)
--   3. withdraw_academy_news_consent_by_opt_out() 080 무료수신거부 → 이 동의를 철회(source opt_out_080, service role)
--   4. marketing_consent_notices                새 알림은 학원이 없다(organization_id null 허용)
--   5. reserve_recontact_batch()                받는 사람 = 단일 동의 + 계정 번호 + 080 아님 + 파기 아님. 시그니처 그대로
--
-- 바꾸지 않는 것
--   - marketing_opt_out_phones(080 번호 표) · 월 한도 · 같은 번호 하나 · 중복 클릭 규칙 · 파기 흐름.
--   - recontact_batches.sender_phone 은 그대로 둔다 — 이제 첫 줄 "(광고) [첫수업] 고객센터 번호"의 번호가 들어간다.
--   - 옛 학원별 동의(parent_marketing_consents · _events · set_my_academy_marketing_consent · list_my_academy_marketing_consents)는
--     지우지 않는다. 운영에 1행이 있다(2026-10-25 확인). 발송 판정에서는 더 읽지 않는다. 제거는 별도 마이그레이션으로 한다.
--     옛 동의는 새 동의로 옮기지 않는다 — "A 학원 광고 동의"는 "첫수업이 보내는 학원 소식 동의"가 아니다.
--
-- 새 표는 trial_applications 를 참조하지 않는다 → 파기 허용 목록(app.assert_trial_purge_schema) 영향 없음.
-- 학부모 탈퇴는 profiles 를 지우므로 cascade 로 함께 지워진다(옛 동의 표와 같다).
-- ⚠️ CLI 가 이 파일을 transaction 으로 감싸지 않으므로 set lock_timeout 같은 세션 설정을 두지 않는다(20261025120000 과 같다).

-- ─────────────────────────────────────────────────────────────
-- 1. 학원 소식 수신 동의 (학부모 1행)
--
-- 정보통신망법 제50조: 광고성 정보는 수신자의 사전 동의가 있어야 보낸다. 보내는 주체(첫수업)에 대한 동의 하나다.
-- 쓰기는 학부모 본인 RPC · 080 처리(service role)만 한다.
-- 읽기: 학부모 본인 행 · 학원은 "자기 학원에 신청한 적 있는 학부모"의 동의 여부 · 시각만(출처 · 문구 버전은 열지 않는다).
-- ─────────────────────────────────────────────────────────────

create table public.parent_academy_news_consents (
  parent_id uuid primary key references public.profiles(id) on delete cascade,
  consented boolean not null,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  -- 마지막으로 상태를 바꾼 경로
  source text not null check (source in ('parent_app', 'parent_web', 'opt_out_080', 'admin')),
  -- 동의 화면 문구 버전(예: 'academy-news-2026-10'). 080 철회는 'opt-out-080'.
  text_version text not null check (char_length(text_version) between 1 and 60),
  updated_at timestamptz not null default now(),
  constraint parent_academy_news_consents_state_check
    check ((consented and consented_at is not null and withdrawn_at is null) or (not consented and withdrawn_at is not null))
);

comment on table public.parent_academy_news_consents is
  '학원 소식(광고성 문자) 수신 동의. 보내는 주체는 첫수업, 학부모 1행. 쓰기는 RPC/서버만.';

create table public.parent_academy_news_consent_events (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('consent', 'withdraw')),
  source text not null check (source in ('parent_app', 'parent_web', 'opt_out_080', 'admin')),
  text_version text not null,
  occurred_at timestamptz not null default now()
);

comment on table public.parent_academy_news_consent_events is
  '학원 소식 수신 동의 · 철회 이력(append-only). 동의 증빙. 학부모 탈퇴 시 profiles cascade 로 함께 지워진다.';

create index parent_academy_news_consent_events_parent_idx
  on public.parent_academy_news_consent_events (parent_id, occurred_at desc);

alter table public.parent_academy_news_consents enable row level security;
alter table public.parent_academy_news_consent_events enable row level security;
revoke all on table public.parent_academy_news_consents from public, anon, authenticated;
revoke all on table public.parent_academy_news_consent_events from public, anon, authenticated;
grant select (parent_id, consented, consented_at, withdrawn_at) on public.parent_academy_news_consents to authenticated;
grant select on public.parent_academy_news_consent_events to authenticated;
grant all on table public.parent_academy_news_consents, public.parent_academy_news_consent_events to service_role;

-- 학원: 자기 학원 수업에 신청한 적 있는 학부모만. 동의는 학원별이 아니므로 학원 id 대신 신청 이력으로 범위를 좁힌다.
-- authenticated 는 trial_applications 를 표 단위로 읽지 못한다(열 권한) → 정책 안 하위 질의 대신 security definer 함수로 본다.
create function app.studio_can_see_parent(p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_org_id() is not null
    and app.current_role() in ('teacher', 'operator')
    and exists (
      select 1 from public.trial_applications ta
      join public.classes c on c.id = ta.class_id
      where ta.parent_id = p_parent and c.organization_id = app.current_org_id()
    )
$$;
revoke all on function app.studio_can_see_parent(uuid) from public, anon;
grant execute on function app.studio_can_see_parent(uuid) to authenticated;

create policy parent_academy_news_consents_parent_select on public.parent_academy_news_consents
  for select to authenticated using (parent_id = auth.uid());
create policy parent_academy_news_consents_studio_select on public.parent_academy_news_consents
  for select to authenticated using (app.studio_can_see_parent(parent_id));
create policy parent_academy_news_consent_events_parent_select on public.parent_academy_news_consent_events
  for select to authenticated using (parent_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 2. 학부모 본인 동의 · 철회 (학부모 앱 · 웹 공용)
--
-- changed: 없음 → 동의, 동의 → 거부, 거부 → 동의만 true. 처리 결과 알림은 이 값으로만 보낸다.
-- 행이 없을 때는 for update 로 잠글 행이 없어 동시 요청 둘이 모두 "없음"을 볼 수 있다 → advisory lock 으로 줄을 세운다.
-- ─────────────────────────────────────────────────────────────

create function public.set_my_academy_news_consent(
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
  v_row public.parent_academy_news_consents;
  v_previous boolean;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and role = 'parent') then
    raise exception 'parent_required' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('parent_app', 'parent_web') then raise exception 'invalid_consent_source'; end if;
  if p_consented is null or coalesce(btrim(p_text_version), '') = '' or char_length(p_text_version) > 60 then
    raise exception 'invalid_consent_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('academy-news-consent:' || v_uid::text, 0));

  select c.consented into v_previous from public.parent_academy_news_consents c where c.parent_id = v_uid;

  insert into public.parent_academy_news_consents as c
    (parent_id, consented, consented_at, withdrawn_at, source, text_version, updated_at)
  values
    (v_uid, p_consented,
     case when p_consented then v_now end, case when p_consented then null else v_now end,
     p_source, btrim(p_text_version), v_now)
  on conflict (parent_id) do update set
    consented = excluded.consented,
    -- 다시 동의하면 동의 시각을 새로 찍고 철회 시각은 지운다. 철회하면 마지막 동의 시각은 남긴다.
    consented_at = case when excluded.consented then v_now else c.consented_at end,
    withdrawn_at = case when excluded.consented then null else v_now end,
    source = excluded.source,
    text_version = excluded.text_version,
    updated_at = v_now
  returning * into v_row;

  insert into public.parent_academy_news_consent_events (parent_id, action, source, text_version, occurred_at)
  values (v_uid, case when p_consented then 'consent' else 'withdraw' end, p_source, btrim(p_text_version), v_now);

  return jsonb_build_object(
    'consented', v_row.consented,
    'consentedAt', v_row.consented_at,
    'withdrawnAt', v_row.withdrawn_at,
    'changed', coalesce(v_previous, false) is distinct from p_consented
  );
end;
$$;

revoke all on function public.set_my_academy_news_consent(boolean, text, text) from public, anon;
grant execute on function public.set_my_academy_news_consent(boolean, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. 080 무료수신거부 → 단일 동의 철회 (service role, 매일 동기화)
--
-- 080 번호 표(marketing_opt_out_phones)는 그대로 쓴다 — 계정이 없는 번호 · 나중에 다시 동의한 번호도 막는다.
-- 이 함수는 그 번호가 계정 번호인 학부모의 동의를 철회로 바꾼다(앱 · 웹의 "학원 소식" 스위치가 꺼져 보이게).
-- 동의 중일 때만 바꾸고 이력을 남긴다. 행이 없거나 이미 철회면 아무것도 하지 않는다(changed = false).
-- 철회 시각은 080 등록 시각(미래면 지금).
-- ─────────────────────────────────────────────────────────────

create function public.withdraw_academy_news_consent_by_opt_out(p_parent_id uuid, p_occurred_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_at timestamptz := least(coalesce(p_occurred_at, now()), now());
  v_changed boolean := false;
begin
  if p_parent_id is null then raise exception 'invalid_consent_input'; end if;

  perform pg_advisory_xact_lock(hashtextextended('academy-news-consent:' || p_parent_id::text, 0));

  update public.parent_academy_news_consents
  set consented = false, withdrawn_at = v_at, source = 'opt_out_080', text_version = 'opt-out-080', updated_at = now()
  where parent_id = p_parent_id and consented;
  v_changed := found;

  if v_changed then
    insert into public.parent_academy_news_consent_events (parent_id, action, source, text_version, occurred_at)
    values (p_parent_id, 'withdraw', 'opt_out_080', 'opt-out-080', v_at);
  end if;

  return jsonb_build_object('parentId', p_parent_id, 'changed', v_changed);
end;
$$;

revoke all on function public.withdraw_academy_news_consent_by_opt_out(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.withdraw_academy_news_consent_by_opt_out(uuid, timestamptz) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. 처리 결과 알림 기록: 학원이 없다
--
-- 20261025120000 은 앱 · 웹 알림에 학원 id 를 요구했다. 이제 동의가 첫수업 하나라 새 알림은 organization_id = null 이다.
-- 080 알림의 "번호마다 한 번"(phone_hash) 규칙은 그대로 둔다. 옛 행(학원 id 있음)도 그대로 통과한다.
-- ─────────────────────────────────────────────────────────────

alter table public.marketing_consent_notices drop constraint marketing_consent_notices_080_check;
alter table public.marketing_consent_notices add constraint marketing_consent_notices_080_check
  check ((source = 'opt_out_080') = (phone_hash is not null) and (source <> 'opt_out_080' or organization_id is null));

-- ─────────────────────────────────────────────────────────────
-- 5. 발송 자리 잡기: 단일 동의로 고른다
--
-- 20261025120000 원문에서 동의 join(parent_marketing_consents × 학원 → parent_academy_news_consents)만 다르다.
-- 시그니처는 그대로 둔다 — 이 마이그레이션 적용 ~ 코드 배포 사이에 지금 Studio 코드가 그대로 부를 수 있다.
-- (그 사이 옛 화면은 옛 동의를 보여 주지만, 고르는 것은 새 동의다 → 동의한 학부모가 없으면 no_eligible 로 막힌다.)
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
    join public.parent_academy_news_consents nc on nc.parent_id = ta.parent_id and nc.consented
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
