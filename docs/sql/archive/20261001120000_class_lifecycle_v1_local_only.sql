-- Local-only CLASS LIFECYCLE V1. No backfill and no existing history cleanup.
begin;
alter table public.classes add column archived_at timestamptz;
alter table public.classes add constraint classes_archived_private check (archived_at is null or not is_active);
-- Existing organization index covers Studio lists; avoid speculative indexes.
alter policy classes_public_read_active on public.classes using (is_active and archived_at is null);

-- Applications cover reports, trial_results, consultations, registration and application logs.
-- Also protect direct history and legacy occurrence references (even malformed cross-class references).
create function app.class_has_operating_history(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.trial_applications a where a.class_id=cid
   or a.class_schedule_id in (select id from public.class_schedules where class_id=cid)
   or a.requested_schedule_block_id in (select id from public.schedule_blocks where class_id=cid)
   or a.confirmed_schedule_block_id in (select id from public.schedule_blocks where class_id=cid))
 or exists(select 1 from public.schedule_blocks where class_id=cid and (related_application_id is not null or type in ('trial_booked','regular')))
 or exists(select 1 from public.sms_logs where class_id=cid)
 or exists(select 1 from public.experience_feedback where class_id=cid);
$$;
revoke all on function app.class_has_operating_history(uuid) from public,anon,authenticated;

create function public.get_studio_class_delete_eligibility() returns table(class_id uuid,can_permanently_delete boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(app.current_role(),'') not in ('teacher','operator') or app.current_org_id() is null
   then raise exception 'studio_class_not_found_or_forbidden'; end if;
 return query select c.id,not app.class_has_operating_history(c.id) from public.classes c where c.organization_id=app.current_org_id();
end $$;

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

create function public.mutate_studio_class_lifecycle(p_class_id uuid,p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.classes; previous_mode text;
begin
 if auth.uid() is null or coalesce(app.current_role(),'') not in ('teacher','operator') or app.current_org_id() is null
   then raise exception 'studio_class_not_found_or_forbidden'; end if;
 -- FOR UPDATE conflicts with FK key-share too: SMS/legacy references cannot slip through deletion.
 select * into c from public.classes where id=p_class_id and organization_id=app.current_org_id() for update;
 if not found then raise exception 'studio_class_not_found_or_forbidden'; end if;
 if p_action='archive' then
   update public.classes set archived_at=coalesce(archived_at,now()),is_active=false where id=c.id;
 elsif p_action='restore' then
   update public.classes set archived_at=null,is_active=false where id=c.id;
 elsif p_action='delete' then
   if app.class_has_operating_history(c.id) then raise exception 'class_has_operating_history'; end if;
   previous_mode:=current_setting('app.rolling_writer',true);
   perform set_config('app.rolling_writer','on',true);
   -- Generated schedule FK RESTRICT requires schedules before rules. Only empty derivatives remain.
   delete from public.class_schedules where class_id=c.id;
   perform set_config('app.class_lifecycle_delete',c.id::text,true);
   delete from public.classes where id=c.id;
   perform set_config('app.class_lifecycle_delete','',true);
   perform set_config('app.rolling_writer',coalesce(previous_mode,''),true);
 else raise exception 'invalid_class_lifecycle_action'; end if;
end $$;
revoke all on function public.mutate_studio_class_lifecycle(uuid,text) from public,anon;
revoke all on function public.get_studio_class_delete_eligibility() from public,anon;
grant execute on function public.mutate_studio_class_lifecycle(uuid,text) to authenticated;
grant execute on function public.get_studio_class_delete_eligibility() to authenticated;

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
  if c.is_active and c.archived_at is null then
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
