-- CLASS LIFECYCLE V1: HARDENING.
-- Apply ONLY after COMPAT, the new app deployment is READY and read-only smoke passes.
-- Never bulk-apply both phases during the COMPAT production window.
begin;
alter table public.classes add constraint classes_archived_private check (archived_at is null or not is_active);
alter policy classes_public_read_active on public.classes using (is_active and archived_at is null);

-- Enforce the contract even for direct table callers. Archived metadata stays read-only.
create function app.guard_class_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='DELETE' then
   if coalesce(current_setting('app.class_lifecycle_delete',true),'') <> old.id::text then raise exception 'class_delete_requires_lifecycle_rpc'; end if;
   if app.class_has_operating_history(old.id) then raise exception 'class_has_operating_history'; end if;
   return old;
 end if;
 if old.archived_at is not null and new.is_active then raise exception 'class_restore_required'; end if;
 if old.archived_at is not null and
   (to_jsonb(new)-array['archived_at','is_active','updated_at']) is distinct from
   (to_jsonb(old)-array['archived_at','is_active','updated_at']) then raise exception 'class_restore_required'; end if;
 if new.archived_at is distinct from old.archived_at and new.is_active then raise exception 'class_lifecycle_requires_private'; end if;
 return new;
end $$;
create trigger guard_class_lifecycle before update or delete on public.classes for each row execute function app.guard_class_lifecycle();

-- Lock on EVERY insertion, including imported/legacy applications without a class_schedule_id.
-- Updating historical applications on an archived class remains permitted.
create or replace function public.lock_class_schedule_application() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.classes;
begin
 if tg_op='INSERT' or new.class_id is distinct from old.class_id or new.class_schedule_id is distinct from old.class_schedule_id then
   select * into c from public.classes where id=new.class_id for no key update;
   if not found then raise exception 'class_not_available'; end if;
   if (tg_op='INSERT' or new.class_id is distinct from old.class_id) and
     (c.archived_at is not null or (app.current_role()='parent' and not c.is_active)) then raise exception 'class_not_available'; end if;
   if new.class_schedule_id is not null and not exists(select 1 from public.class_schedules where id=new.class_schedule_id and class_id=new.class_id)
     then raise exception 'class_schedule_not_found'; end if;
 end if;
 return new;
end $$;
drop trigger lock_class_schedule_application on public.trial_applications;
create trigger lock_class_schedule_application before insert or update of class_id,class_schedule_id on public.trial_applications
 for each row execute function public.lock_class_schedule_application();

-- An archived class cannot be reconfigured through a stale rule editor/RPC.
create function app.guard_archived_operating_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare archived timestamptz;
begin
 select archived_at into archived from public.classes where id=new.class_id for no key update;
 if archived is not null then raise exception 'class_restore_required'; end if;
 return new;
end $$;
create trigger guard_archived_operating_rule before insert or update on public.class_operating_rules
 for each row execute function app.guard_archived_operating_rule();

-- Manual schedule insertion also serializes with archive. Historical rows remain untouched.
create function app.guard_archived_class_schedule_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare archived timestamptz;
begin
 select archived_at into archived from public.classes where id=new.class_id for no key update;
 if archived is not null then raise exception 'class_restore_required'; end if;
 return new;
end $$;
create trigger guard_archived_class_schedule_insert before insert on public.class_schedules
 for each row execute function app.guard_archived_class_schedule_insert();

create or replace function app.valid_parent_application_initial_context(p_class uuid, p_child uuid, p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.current_role() = 'parent'
    and exists (select 1 from public.classes c where c.id=p_class and c.is_active and c.archived_at is null
      and p_teacher is not distinct from (case when c.assignment_mode='preassigned' then c.teacher_id else null end))
    and (p_child is null or exists (select 1 from public.children ch where ch.id=p_child and ch.parent_id=auth.uid()));
$$;

create or replace function public.reconcile_class_operating_rule(p_class_id uuid, p_today date, p_reconcile boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.class_operating_rules; c public.classes; n integer := 0; previous_mode text;
begin
  select * into c from public.classes where id = p_class_id for no key update;
  if c.id is null or c.archived_at is not null then return 0; end if;
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

notify pgrst, 'reload schema';
commit;
