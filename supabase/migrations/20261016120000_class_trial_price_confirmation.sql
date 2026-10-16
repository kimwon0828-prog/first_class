-- 체험 신청비 확인 기록.
-- classes.trial_price 는 not null default 0 이라 "미입력"과 "실제 무료"가 모두 0 이다.
-- 학원이 Studio 에서 무료·유료를 직접 골라 저장한 때만 확인 시각을 남기고, 학부모 화면은 확인된 0원만 "무료"로 보여 준다.
--
-- 기존 행은 채우지 않는다(no backfill): 과거의 0원이 실제 무료였는지 이 DB 로는 알 수 없다.
--
-- 일관성은 DB 가 같은 문장(같은 트랜잭션) 안에서 지킨다 — 클라이언트·RPC 어느 경로든 같다.
--   * 가격(trial_price)이 바뀌었는데 같은 문장에서 확인을 쓰지 않았다 → 확인 기록을 지운다.
--   * 같은 문장에서 확인 값을 쓰면(null 이 아닌 값) → DB 시각 now() 로 기록한다(클라이언트 시각을 믿지 않는다).
--   * 제목·사진 등 다른 열만 바뀐 문장 → 확인 기록을 그대로 둔다.
-- Studio 저장 RPC 는 허용된 키만 받으므로 trial_price_confirmed_at 하나를 허용 목록에 더한다(그 밖의 본문은 20260927120000 과 같다).
begin;
alter table public.classes add column if not exists trial_price_confirmed_at timestamptz;
comment on column public.classes.trial_price_confirmed_at is
  'Studio에서 학원이 체험 신청비(무료/유료)를 직접 선택해 저장한 시각. null이면 확인 기록 없음(0원은 무료로 표시하지 않음). 기존 행은 채우지 않음. 가격이 확인 없이 바뀌면 트리거가 지움.';

create or replace function app.keep_class_trial_price_confirmation_consistent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.trial_price_confirmed_at is not null then new.trial_price_confirmed_at := now(); end if;
    return new;
  end if;
  if new.trial_price_confirmed_at is distinct from old.trial_price_confirmed_at then
    -- 이 문장이 확인 값을 직접 썼다: 확인(시각은 DB 기준) 또는 해제(null).
    if new.trial_price_confirmed_at is not null then new.trial_price_confirmed_at := now(); end if;
  elsif new.trial_price is distinct from old.trial_price then
    -- 가격이 바뀌었는데 이 문장에서 확인하지 않았다: 이전 가격의 확인을 남기지 않는다.
    new.trial_price_confirmed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists keep_class_trial_price_confirmation_consistent on public.classes;
create trigger keep_class_trial_price_confirmation_consistent before insert or update on public.classes
  for each row execute function app.keep_class_trial_price_confirmation_consistent();

create or replace function public.save_studio_class_operating_rule(p_class_id uuid, p_fields jsonb, p_rule jsonb, p_expected_revision integer, p_manual_slots jsonb default '[]')
returns setof public.classes language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid := p_class_id; org uuid; current_revision integer; col text; cols text := ''; vals text := ''; sets text := ''; r public.class_operating_rules; manual jsonb;
begin
  org := (p_fields->>'organization_id')::uuid;
  if coalesce(app.current_role(),'') not in ('teacher','operator') or app.current_org_id() is distinct from org
    then raise exception 'studio_class_not_found_or_forbidden'; end if;
  if cid is not null then
    perform 1 from public.classes where id=cid and organization_id=org for no key update;
    if not found then raise exception 'studio_class_not_found_or_forbidden'; end if;
  end if;
  if p_fields->>'teacher_id' is not null and not exists(select 1 from public.teachers
    where id=(p_fields->>'teacher_id')::uuid and organization_id=org)
    then raise exception 'invalid_teacher_for_organization'; end if;
  if p_fields->>'assignment_mode' = 'preassigned' and p_fields->>'teacher_id' is null
    then raise exception 'preassigned_teacher_required'; end if;
  select revision into current_revision from public.class_operating_rules where class_id=cid;
  if p_rule is not null and coalesce(current_revision,0) is distinct from p_expected_revision
    then raise exception 'operating_rule_revision_conflict'; end if;
  for col in select jsonb_object_keys(p_fields) loop
    if not col = any(array['organization_id','program_type','assignment_mode','title','subject','subject_category_id','subject_id',
      'target_age','description','trial_price','regular_price_type','regular_price_amount','regular_price_note','teacher_id','teacher_display_name','cover_image_url','is_active','updated_at',
      'class_format','recommended_for','experience_points','curriculum','teacher_intro',
      'trial_price_confirmed_at'])
      then raise exception 'invalid_class_field'; end if;
    cols := cols || case when cols='' then '' else ',' end || quote_ident(col);
    vals := vals || case when vals='' then '' else ',' end || format('(jsonb_populate_record(null::public.classes,$1)).%I',col);
    sets := sets || case when sets='' then '' else ',' end || format('%I=(jsonb_populate_record(null::public.classes,$1)).%I',col,col);
  end loop;
  if cid is null then
    execute format('insert into public.classes(%s) select %s returning id',cols,vals) into cid using p_fields;
  else
    execute format('update public.classes set %s where id=$2',sets) using p_fields,cid;
  end if;
  if p_rule is not null then
    insert into public.class_operating_rules(class_id,operation_type,start_date,end_date,slots)
    values(cid,p_rule->>'operationType',(p_rule->>'startDate')::date,(p_rule->>'endDate')::date,p_rule->'slots')
    on conflict (class_id) do update set operation_type=excluded.operation_type,start_date=excluded.start_date,
      end_date=excluded.end_date,slots=excluded.slots,revision=class_operating_rules.revision+1,is_active=true,updated_at=now()
    returning * into r;
  end if;
  -- Only CREATE can carry draft-only extra/closed slots. UPDATE uses existing dated-operation routes.
  if p_class_id is null then
    if jsonb_typeof(p_manual_slots) is distinct from 'array' or jsonb_array_length(p_manual_slots)>10000
      then raise exception 'invalid_manual_slots'; end if;
    for manual in select value from jsonb_array_elements(p_manual_slots) loop
      if manual->>'scheduleType' <> 'one_time' or manual->>'bookingStatus' not in ('open','closed','hidden')
        then raise exception 'invalid_manual_slot'; end if;
      insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity,booking_status,is_manual_override)
      values(cid,'one_time',(manual->>'specificDate')::date,(manual->>'startTime')::time,(manual->>'endTime')::time,
        (manual->>'capacity')::int,manual->>'bookingStatus',true);
    end loop;
  end if;
  perform public.reconcile_class_operating_rule(cid,(now() at time zone 'Asia/Seoul')::date,p_rule is not null);
  return query select * from public.classes where id=cid;
end $$;
commit;
