-- Additive: no existing rows are adopted, deleted, or inferred as recurrence rules.
create table public.class_operating_rules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes(id) on delete cascade,
  unique(id,class_id),
  operation_type text not null check (operation_type in ('rolling', 'fixed_period')),
  start_date date not null,
  end_date date,
  rolling_days integer not null default 90 check (rolling_days = 90),
  slots jsonb not null,
  is_active boolean not null default true,
  revision integer not null default 1,
  last_generated_on date,
  updated_at timestamptz not null default now(),
  check ((operation_type = 'rolling' and end_date is null)
    or (operation_type = 'fixed_period' and end_date is not null and end_date >= start_date))
);

alter table public.class_schedules
  add column generated_by_rule_id uuid references public.class_operating_rules(id) on delete restrict,
  add column is_manual_override boolean not null default false;
alter table public.class_schedules add constraint class_schedules_rule_class_fkey
  foreign key(generated_by_rule_id,class_id) references public.class_operating_rules(id,class_id);

-- Existing duplicate legacy slots do not block this migration. New managed slots are unique.
create unique index class_schedules_generated_slot_key
  on public.class_schedules(class_id, specific_date, start_time)
  where generated_by_rule_id is not null;

create table public.class_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  specific_date date not null,
  start_time time, -- NULL means a whole-date override, including as-yet ungenerated times.
  booking_status text not null check (booking_status in ('open', 'closed', 'hidden', 'deleted')),
  updated_at timestamptz not null default now()
);
create unique index class_schedule_exceptions_key on public.class_schedule_exceptions
  (class_id, specific_date, coalesce(start_time, '24:00'::time));

alter table public.class_operating_rules enable row level security;
alter table public.class_schedule_exceptions enable row level security;
create policy class_operating_rules_studio_read on public.class_operating_rules for select to authenticated
  using (app.current_role() in ('teacher','operator') and exists (
    select 1 from public.classes c where c.id = class_id and c.organization_id = app.current_org_id()));
create policy class_schedule_exceptions_studio_read on public.class_schedule_exceptions for select to authenticated
  using (app.current_role() in ('teacher','operator') and exists (
    select 1 from public.classes c where c.id = class_id and c.organization_id = app.current_org_id()));
revoke all on public.class_operating_rules, public.class_schedule_exceptions from anon, authenticated;
grant select on public.class_operating_rules, public.class_schedule_exceptions to authenticated;
grant all on public.class_operating_rules, public.class_schedule_exceptions to service_role;

create function public.validate_class_operating_rule() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare s jsonb; seen text[] := '{}'; k text;
begin
  if jsonb_typeof(new.slots) is distinct from 'array' or jsonb_array_length(new.slots) not between 1 and 336
    then raise exception 'invalid_operating_rule_slots'; end if;
  if new.operation_type = 'fixed_period' and new.end_date - new.start_date > 730
    then raise exception 'operating_rule_period_too_long'; end if;
  for s in select value from jsonb_array_elements(new.slots) loop
    if jsonb_typeof(s) is distinct from 'object' or not (s ?& array['weekday','startTime','endTime','capacity','seriesId'])
      or jsonb_typeof(s->'weekday') is distinct from 'number' or jsonb_typeof(s->'capacity') is distinct from 'number'
      or jsonb_typeof(s->'startTime') is distinct from 'string' or jsonb_typeof(s->'endTime') is distinct from 'string'
      or jsonb_typeof(s->'seriesId') is distinct from 'string'
      or (s->>'weekday') !~ '^[0-6]$' or (s->>'capacity') !~ '^[1-9][0-9]*$'
      or (s->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (s->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (s->>'endTime')::time <= (s->>'startTime')::time
      or (s->>'seriesId')::uuid is null or (s->>'capacity')::int < 1
      then raise exception 'invalid_operating_rule_slot'; end if;
    k := (s->>'weekday') || ':' || (s->>'startTime');
    if k = any(seen) then raise exception 'duplicate_operating_rule_slot'; end if;
    seen := array_append(seen,k);
    if (s->>'endTime')::time - (s->>'startTime')::time
      <> (new.slots->0->>'endTime')::time - (new.slots->0->>'startTime')::time
      then raise exception 'mixed_operating_intervals'; end if;
  end loop;
  if exists (
    select 1 from (
      select x->>'seriesId' series_id, x->>'weekday' weekday,
        jsonb_agg(jsonb_build_array(x->>'startTime',x->>'endTime',x->>'capacity') order by x->>'startTime') pattern
      from jsonb_array_elements(new.slots) x group by x->>'seriesId',x->>'weekday'
    ) patterns group by series_id having count(distinct pattern)>1
  ) then raise exception 'inconsistent_operating_series'; end if;
  return new;
end $$;
create trigger validate_class_operating_rule before insert or update on public.class_operating_rules
  for each row execute function public.validate_class_operating_rule();

-- Private helper: callers already checked ownership, or are the service-only cron.
-- A class row lock serializes publication, rule changes, and concurrent jobs.
create function public.reconcile_class_operating_rule(p_class_id uuid, p_today date, p_reconcile boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.class_operating_rules; c public.classes; n integer := 0; previous_mode text;
begin
  select * into c from public.classes where id = p_class_id for no key update;
  select * into r from public.class_operating_rules where class_id = p_class_id;
  if r.id is null or not r.is_active then return 0; end if;
  previous_mode := current_setting('app.rolling_writer', true);
  perform set_config('app.rolling_writer','on',true);
  if p_reconcile then
    -- Only future, unreferenced, unmodified rows whose provenance is OUR rule.
    delete from public.class_schedules s
    where s.generated_by_rule_id = r.id and not s.is_manual_override
      and s.specific_date + s.start_time > (now() at time zone 'Asia/Seoul')
      and s.specific_date >= p_today
      and not exists(select 1 from public.trial_applications a where a.class_schedule_id = s.id)
      and not exists(select 1 from public.class_schedule_exceptions e where e.class_id = p_class_id
        and e.specific_date = s.specific_date and (e.start_time is null or e.start_time = s.start_time))
      and not (s.specific_date >= r.start_date
        and (r.end_date is null or s.specific_date <= r.end_date)
        and exists(select 1 from jsonb_array_elements(r.slots) x where
          (x->>'weekday')::int = extract(dow from s.specific_date)::int
          and (x->>'startTime')::time = s.start_time and (x->>'endTime')::time = s.end_time));
    -- A matching identity keeps its ID. Capacity changes affect only unbooked automatic rows.
    update public.class_schedules s set capacity = (x->>'capacity')::int, updated_at = now()
    from jsonb_array_elements(r.slots) x
    where s.generated_by_rule_id = r.id and not s.is_manual_override
      and s.specific_date >= p_today and s.specific_date + s.start_time > (now() at time zone 'Asia/Seoul')
      and (x->>'weekday')::int = extract(dow from s.specific_date)::int
      and (x->>'startTime')::time = s.start_time and (x->>'endTime')::time = s.end_time
      and not exists(select 1 from public.trial_applications a where a.class_schedule_id = s.id)
      and not exists(select 1 from public.class_schedule_exceptions e where e.class_id = p_class_id
        and e.specific_date = s.specific_date and (e.start_time is null or e.start_time = s.start_time));
  end if;
  -- Private rolling classes retain all existing dates but receive no new dates.
  if c.is_active or r.operation_type = 'fixed_period' then
    insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,
      capacity,series_id,booking_status,generated_by_rule_id)
    select p_class_id,'one_time',d::date,(x->>'startTime')::time,(x->>'endTime')::time,
      (x->>'capacity')::int,(x->>'seriesId')::uuid,coalesce(e.booking_status,'open'),r.id
    from generate_series(greatest(r.start_date,p_today)::timestamp,
      (case when r.operation_type = 'rolling' then p_today + 89 else r.end_date end)::timestamp, interval '1 day') d
    cross join jsonb_array_elements(r.slots) x
    left join public.class_schedule_exceptions e on e.class_id = p_class_id and e.specific_date = d::date and e.start_time is null
    where extract(dow from d)::int = (x->>'weekday')::int
      and d::date + (x->>'startTime')::time > (now() at time zone 'Asia/Seoul')
      and coalesce(e.booking_status,'open') <> 'deleted'
      and not exists(select 1 from public.class_schedule_exceptions ex where ex.class_id = p_class_id
        and ex.specific_date = d::date and ex.start_time = (x->>'startTime')::time)
      and not exists(select 1 from public.class_schedules s where s.class_id = p_class_id
        and s.schedule_type = 'one_time' and s.specific_date = d::date and s.start_time = (x->>'startTime')::time)
    on conflict do nothing;
    get diagnostics n = row_count;
    update public.class_operating_rules set last_generated_on = p_today where id = r.id;
  end if;
  perform set_config('app.rolling_writer',coalesce(previous_mode,''),true);
  return n;
end $$;
revoke all on function public.reconcile_class_operating_rule(uuid,date,boolean) from public,anon,authenticated,service_role;

-- Schedule mutations from existing routes automatically preserve their manual intent.
create function public.protect_class_schedule_override() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; managed boolean;
begin
  cid := case when tg_op = 'INSERT' then new.class_id else old.class_id end;
  select exists(select 1 from public.class_operating_rules where class_id = cid) into managed;
  if not managed then
    if tg_op <> 'DELETE' and new.generated_by_rule_id is not null then raise exception 'automatic_schedule_provenance_forbidden'; end if;
    return coalesce(new,old);
  end if;
  if tg_op = 'UPDATE' and new.class_id <> old.class_id then raise exception 'schedule_class_change_forbidden'; end if;
  perform 1 from public.classes where id = cid for no key update;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and
    (old.class_id,old.schedule_type,old.specific_date,old.start_time,old.end_time,old.day_of_week)
    is distinct from (new.class_id,new.schedule_type,new.specific_date,new.start_time,new.end_time,new.day_of_week)) then
    if exists(select 1 from public.trial_applications where class_schedule_id = old.id)
      then raise exception 'protected_class_schedule_change_blocked'; end if;
  end if;
  if current_setting('app.rolling_writer',true) = 'on' then return coalesce(new,old); end if;
  if tg_op = 'INSERT' then
    if new.generated_by_rule_id is not null then raise exception 'automatic_schedule_provenance_forbidden'; end if;
    -- Serialize with cron, including legacy tables without the optional unique index.
    if new.schedule_type = 'one_time' and exists(select 1 from public.class_schedules s
      where s.class_id=cid and s.specific_date=new.specific_date and s.start_time=new.start_time)
      then raise exception 'duplicate_class_schedule'; end if;
  elsif tg_op = 'UPDATE' then
    if new.generated_by_rule_id is distinct from old.generated_by_rule_id
      then raise exception 'automatic_schedule_provenance_forbidden'; end if;
    if old.specific_date is not null and (old.specific_date,old.start_time) is distinct from (new.specific_date,new.start_time) then
      insert into public.class_schedule_exceptions(class_id,specific_date,start_time,booking_status)
      values(cid,old.specific_date,old.start_time,'deleted')
      on conflict (class_id,specific_date,(coalesce(start_time,'24:00'::time)))
      do update set booking_status='deleted',updated_at=now();
    end if;
    if (new.capacity,new.booking_status,new.display_label,new.specific_date,new.start_time,new.end_time)
      is distinct from (old.capacity,old.booking_status,old.display_label,old.specific_date,old.start_time,old.end_time)
      then new.is_manual_override := true;
    else new.is_manual_override := old.is_manual_override; end if;
  elsif tg_op = 'DELETE' and old.specific_date is not null then
    insert into public.class_schedule_exceptions(class_id,specific_date,start_time,booking_status)
    values(cid,old.specific_date,old.start_time,'deleted')
    on conflict (class_id,specific_date,(coalesce(start_time,'24:00'::time)))
    do update set booking_status='deleted',updated_at=now();
  end if;
  return coalesce(new,old);
end $$;
create trigger protect_class_schedule_override before insert or update or delete on public.class_schedules
  for each row execute function public.protect_class_schedule_override();

-- Parent booking must acquire the same class lock BEFORE its FK reference is established.
create function public.lock_class_schedule_application() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.class_schedule_id is not null and (tg_op='INSERT' or new.class_schedule_id is distinct from old.class_schedule_id) then
    perform 1 from public.classes where id=new.class_id for no key update;
    if not exists(select 1 from public.class_schedules where id=new.class_schedule_id and class_id=new.class_id)
      then raise exception 'class_schedule_not_found'; end if;
  end if;
  return new;
end $$;
create trigger lock_class_schedule_application before insert or update of class_schedule_id on public.trial_applications
  for each row execute function public.lock_class_schedule_application();

-- Atomic class fields + rule revision + reconciliation. No arbitrary column updates.
create function public.save_studio_class_operating_rule(p_class_id uuid, p_fields jsonb, p_rule jsonb, p_expected_revision integer, p_manual_slots jsonb default '[]')
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
      'target_age','description','trial_price','teacher_id','teacher_display_name','cover_image_url','is_active','updated_at',
      'class_format','recommended_for','experience_points','curriculum','teacher_intro'])
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
revoke all on function public.save_studio_class_operating_rule(uuid,jsonb,jsonb,integer,jsonb) from public,anon;
grant execute on function public.save_studio_class_operating_rule(uuid,jsonb,jsonb,integer,jsonb) to authenticated;

create function public.refill_republished_class() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_active and not old.is_active then
    perform public.reconcile_class_operating_rule(new.id,(now() at time zone 'Asia/Seoul')::date,false);
  end if;
  return new;
end $$;
create trigger refill_republished_class after update of is_active on public.classes
  for each row execute function public.refill_republished_class();

create function public.set_class_schedule_date_exception(p_class_id uuid,p_date date,p_status text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if coalesce(app.current_role(),'') not in ('teacher','operator') then raise exception 'forbidden'; end if;
  perform 1 from public.classes where id=p_class_id and organization_id=app.current_org_id() for no key update;
  if not found then raise exception 'studio_class_not_found_or_forbidden'; end if;
  if p_status not in ('open','closed','hidden') or p_date is null then raise exception 'invalid_date_exception'; end if;
  insert into public.class_schedule_exceptions(class_id,specific_date,booking_status) values(p_class_id,p_date,p_status)
  on conflict (class_id,specific_date,(coalesce(start_time,'24:00'::time)))
  do update set booking_status=excluded.booking_status,updated_at=now();
  update public.class_schedules set booking_status=p_status,is_manual_override=true,updated_at=now()
    where class_id=p_class_id and schedule_type='one_time' and specific_date=p_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_class_schedule_date_exception(uuid,date,text) from public,anon;
grant execute on function public.set_class_schedule_date_exception(uuid,date,text) to authenticated;

-- Lock class before locking the individual schedule, matching the reconciliation lock order.
create function public.mutate_studio_class_schedule(p_schedule_id uuid,p_patch jsonb default '{}',p_delete boolean default false)
returns setof public.class_schedules language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid; s public.class_schedules; active_count integer; k text;
begin
  if coalesce(app.current_role(),'') not in ('teacher','operator') then raise exception 'forbidden'; end if;
  select class_id into cid from public.class_schedules where id=p_schedule_id;
  perform 1 from public.classes where id=cid and organization_id=app.current_org_id() for no key update;
  if not found then raise exception 'class_schedule_not_found_or_forbidden'; end if;
  select * into s from public.class_schedules where id=p_schedule_id for update;
  if not found then raise exception 'class_schedule_not_found_or_forbidden'; end if;
  if p_delete then
    if exists(select 1 from public.trial_applications where class_schedule_id=s.id)
      then raise exception 'protected_class_schedule_change_blocked'; end if;
    delete from public.class_schedules where id=s.id;
    return;
  end if;
  if s.schedule_type<>'one_time' then raise exception 'weekly_class_schedule_must_be_updated_from_class_management'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('capacity','booking_status','display_label') then raise exception 'invalid_schedule_patch'; end if;
  end loop;
  if p_patch ? 'capacity' then
    select count(*) into active_count from public.trial_applications where class_schedule_id=s.id and status in ('new','reviewing','confirmed');
    if coalesce((p_patch->>'capacity')::int,0)<greatest(active_count,1) then raise exception 'class_schedule_capacity_below_active_reservations'; end if;
  end if;
  return query update public.class_schedules set
    capacity=case when p_patch ? 'capacity' then (p_patch->>'capacity')::int else capacity end,
    booking_status=case when p_patch ? 'booking_status' then p_patch->>'booking_status' else booking_status end,
    display_label=case when p_patch ? 'display_label' then p_patch->>'display_label' else display_label end,
    updated_at=now() where id=s.id returning *;
end $$;
revoke all on function public.mutate_studio_class_schedule(uuid,jsonb,boolean) from public,anon;
grant execute on function public.mutate_studio_class_schedule(uuid,jsonb,boolean) to authenticated;

-- Service-only, per-class transactions at the caller; one failure does not starve later classes.
create function public.extend_rolling_class_schedule(p_class_id uuid) returns integer
language sql security definer set search_path = public, pg_temp as $$
  select case when exists(select 1 from public.class_operating_rules where class_id=p_class_id and operation_type='rolling')
    then public.reconcile_class_operating_rule(p_class_id,(now() at time zone 'Asia/Seoul')::date,false) else 0 end;
$$;
revoke all on function public.extend_rolling_class_schedule(uuid) from public,anon,authenticated;
grant execute on function public.extend_rolling_class_schedule(uuid) to service_role;
