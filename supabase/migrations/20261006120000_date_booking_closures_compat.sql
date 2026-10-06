-- COMPAT: independent date/interval overlay. No existing row/status/policy rewrite.
begin;
create table public.date_booking_closures (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 class_id uuid references public.classes(id),
 specific_date date not null,
 start_at timestamptz not null,
 end_at timestamptz not null,
 reason text check (char_length(reason)<=500),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 released_at timestamptz,
 released_by uuid references public.profiles(id),
 check(end_at>start_at),
 check((start_at at time zone 'Asia/Seoul')::date=specific_date)
);
create unique index date_booking_closures_active_key on public.date_booking_closures
 (organization_id,(coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid)),specific_date,start_at,end_at)
 where released_at is null;
create index date_booking_closures_active_day on public.date_booking_closures(organization_id,specific_date) where released_at is null;
alter table public.date_booking_closures enable row level security;
create policy date_booking_closures_studio_read on public.date_booking_closures for select to authenticated
 using (app.current_role() in ('teacher','operator') and organization_id=app.current_org_id());
revoke all on public.date_booking_closures from anon,authenticated;
grant select on public.date_booking_closures to authenticated;
grant all on public.date_booking_closures to service_role;

create function app.is_date_booking_closed(p_class uuid,p_start timestamptz,p_end timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.date_booking_closures x join public.classes c on c.organization_id=x.organization_id
  where c.id=p_class and (x.class_id is null or x.class_id=p_class) and x.released_at is null
   and x.start_at<p_end and x.end_at>p_start);
$$;
revoke all on function app.is_date_booking_closed(uuid,timestamptz,timestamptz) from public,anon,authenticated;

-- Same source priority as Parent availability. Weekly legacy rows are occurrences,
-- never newly inserted schedules. Block fallback is used only without class schedules.
create function app.booking_occurrences_on(p_org uuid,p_date date)
returns table(source text,id uuid,class_id uuid,class_title text,start_at timestamptz,end_at timestamptz,booking_status text,capacity int)
language sql stable security definer set search_path='' as $$
 select 'class_schedule',s.id,c.id,c.title,(p_date+s.start_time) at time zone 'Asia/Seoul',
  (p_date+case when s.end_time<=s.start_time then 1 else 0 end+s.end_time) at time zone 'Asia/Seoul',
  case when not c.is_active then 'hidden' else s.booking_status end,greatest(1,coalesce(s.capacity,1))
 from public.classes c join public.class_schedules s on s.class_id=c.id
 where c.organization_id=p_org and c.archived_at is null and
  ((s.schedule_type='one_time' and s.specific_date=p_date) or (s.schedule_type='weekly' and s.day_of_week=extract(dow from p_date)))
 union all
 select 'schedule_block',b.id,c.id,c.title,b.start_at,b.end_at,
  case when not c.is_active then 'hidden' else 'open' end,greatest(1,coalesce(b.capacity,1))
 from public.classes c join public.schedule_blocks b on (b.class_id=c.id or (b.class_id is null and b.teacher_id=c.teacher_id))
 where c.organization_id=p_org and c.archived_at is null and b.type='available'
  and (b.start_at at time zone 'Asia/Seoul')::date=p_date
  and not exists(select 1 from public.class_schedules s where s.class_id=c.id);
$$;
revoke all on function app.booking_occurrences_on(uuid,date) from public,anon,authenticated;

create function public.get_studio_booking_day(p_date date,p_organization_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=app.current_org_id(); payload jsonb;
begin
 if (p_organization_id is not null and p_organization_id is distinct from org) or auth.uid() is null or org is null or coalesce(app.current_role(),'') not in ('teacher','operator') then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 select jsonb_build_object('occurrences',coalesce((select jsonb_agg(jsonb_build_object(
  'key',o.class_id::text||'/'||o.source||'/'||o.id::text,'source',o.source,'id',o.id,'classId',o.class_id,'classTitle',o.class_title,
  'startAt',o.start_at,'endAt',o.end_at,'bookingStatus',o.booking_status,'capacity',o.capacity,
  'reservationIds',(select coalesce(jsonb_agg(a.id),'[]') from public.trial_applications a where a.class_id=o.class_id
   and a.status in ('new','reviewing','confirmed') and coalesce(a.confirmed_slot_at,a.requested_slot_at)=o.start_at),
  'closureIds',(select coalesce(jsonb_agg(x.id),'[]') from public.date_booking_closures x
   where x.organization_id=org and x.released_at is null and (x.class_id is null or x.class_id=o.class_id)
    and x.start_at<o.end_at and x.end_at>o.start_at)) order by o.start_at,o.end_at,o.class_id,o.id)
  from app.booking_occurrences_on(org,p_date)o),'[]'),
 'closures',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'organizationId',x.organization_id,'classId',x.class_id,
  'dateKey',x.specific_date,'startAt',x.start_at,'endAt',x.end_at,'reason',x.reason)) from public.date_booking_closures x
  where x.organization_id=org and x.specific_date=p_date and x.released_at is null),'[]')) into payload;
 return payload;
end $$;
revoke all on function public.get_studio_booking_day(date,uuid) from public,anon;
grant execute on function public.get_studio_booking_day(date,uuid) to authenticated;

-- Parent gets indexes only: neither internal reasons nor organization/closure IDs.
create function public.get_closed_booking_slot_indexes(p_class_id uuid,p_starts timestamptz[],p_ends timestamptz[])
returns integer[] language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(cardinality(p_starts),0)>3000 or cardinality(p_starts) is distinct from cardinality(p_ends)
  then raise exception 'invalid_booking_slots'; end if;
 if not exists(select 1 from public.classes c where c.id=p_class_id and c.is_active and c.archived_at is null) then return array[]::int[]; end if;
 return array(select i from generate_subscripts(p_starts,1)i where app.is_date_booking_closed(p_class_id,p_starts[i],p_ends[i]));
end $$;
revoke all on function public.get_closed_booking_slot_indexes(uuid,timestamptz[],timestamptz[]) from public;
grant execute on function public.get_closed_booking_slot_indexes(uuid,timestamptz[],timestamptz[]) to anon,authenticated,service_role;

create function public.mutate_studio_booking_closures(p_date date,p_class_id uuid,p_mode text,p_slot_keys text[],p_expected_targets text[],p_closure_ids uuid[] default '{}',p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=app.current_org_id(); actor uuid:=auth.uid(); targets text[]; changed int:=0; n int; selected_window record;
begin
 if actor is null or org is null or coalesce(app.current_role(),'') not in ('teacher','operator') then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('close','release') or p_date is null or p_date<(now() at time zone 'Asia/Seoul')::date
  or (p_mode='close' and coalesce(cardinality(p_slot_keys),0)=0) or cardinality(p_slot_keys)>200
  or (select count(distinct k) from unnest(p_slot_keys)k)<>coalesce(cardinality(p_slot_keys),0) or char_length(p_reason)>500
  then raise exception 'invalid_booking_request'; end if;
 if p_class_id is not null and not exists(select 1 from public.classes where id=p_class_id and organization_id=org and archived_at is null)
  then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 -- Academy mutex also covers classes created while an all-course closure is saving.
 -- New application trigger takes its shared side BEFORE existing class locks.
 perform pg_advisory_xact_lock(hashtextextended('date-booking:'||org::text,0));
 -- Sorted class locks are shared with application insertion, confirmation and rolling.
 perform 1 from public.classes c where c.organization_id=org and (p_class_id is null or c.id=p_class_id) order by c.id for no key update;
 if (select count(distinct k) from unnest(p_slot_keys)k)<>(select count(*) from app.booking_occurrences_on(org,p_date)o
  where (p_class_id is null or o.class_id=p_class_id) and (o.class_id::text||'/'||o.source||'/'||o.id::text)=any(p_slot_keys))
  then raise exception 'booking_slots_changed'; end if;
 if p_mode='release' then
  if coalesce(cardinality(p_closure_ids),0)=0 or cardinality(p_closure_ids)>500 then raise exception 'invalid_booking_request'; end if;
  if (select count(distinct i) from unnest(p_closure_ids)i)<>(select count(*) from public.date_booking_closures x where x.id=any(p_closure_ids)
    and x.organization_id=org and x.specific_date=p_date and x.class_id is not distinct from p_class_id
    and (coalesce(cardinality(p_slot_keys),0)=0 or exists(select 1 from app.booking_occurrences_on(org,p_date)o where (o.class_id::text||'/'||o.source||'/'||o.id::text)=any(p_slot_keys)
     and x.start_at<o.end_at and x.end_at>o.start_at))) then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 end if;
 with windows as (
  select o.start_at,o.end_at from app.booking_occurrences_on(org,p_date)o where p_mode='close'
    and (o.class_id::text||'/'||o.source||'/'||o.id::text)=any(p_slot_keys)
  union all select x.start_at,x.end_at from public.date_booking_closures x where p_mode='release' and x.id=any(p_closure_ids)
 ) select coalesce(array_agg(distinct o.class_id::text||'/'||o.source||'/'||o.id::text order by o.class_id::text||'/'||o.source||'/'||o.id::text),'{}') into targets
 from app.booking_occurrences_on(org,p_date)o where (p_class_id is null or o.class_id=p_class_id)
 and exists(select 1 from windows w where w.start_at<o.end_at and w.end_at>o.start_at);
 if targets is distinct from (select coalesce(array_agg(distinct k order by k),'{}') from unnest(p_expected_targets)k)
  then raise exception 'booking_slots_changed'; end if;
 if p_mode='close' then
  for selected_window in select distinct o.start_at,o.end_at from app.booking_occurrences_on(org,p_date)o
    where (o.class_id::text||'/'||o.source||'/'||o.id::text)=any(p_slot_keys) loop
   insert into public.date_booking_closures(organization_id,class_id,specific_date,start_at,end_at,reason,created_by)
    values(org,p_class_id,p_date,selected_window.start_at,selected_window.end_at,nullif(btrim(p_reason),''),actor) on conflict do nothing;
   get diagnostics n=row_count; changed:=changed+n;
  end loop;
 else
  update public.date_booking_closures set released_at=now(),released_by=actor where id=any(p_closure_ids) and released_at is null;
  get diagnostics changed=row_count;
 end if;
 return jsonb_build_object('changed',changed,'targetCount',cardinality(targets));
end $$;
revoke all on function public.mutate_studio_booking_closures(date,uuid,text,text[],text[],uuid[],text) from public,anon;
grant execute on function public.mutate_studio_booking_closures(date,uuid,text,text[],text[],uuid[],text) to authenticated;

create function app.booking_application_end(a public.trial_applications) returns timestamptz
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select coalesce(a.confirmed_slot_at,a.requested_slot_at)+(s.end_time-s.start_time)+case when s.end_time<=s.start_time then interval '1 day' else interval '0' end
   from public.class_schedules s where s.id=a.class_schedule_id and s.class_id=a.class_id),
  (select end_at from public.schedule_blocks where id=coalesce(a.confirmed_schedule_block_id,a.requested_schedule_block_id)));
$$;
revoke all on function app.booking_application_end(public.trial_applications) from public,anon,authenticated;

create function app.lock_date_booking_organization() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 if tg_op='UPDATE' and new.class_id=old.class_id and
  coalesce(new.confirmed_slot_at,new.requested_slot_at) is not distinct from coalesce(old.confirmed_slot_at,old.requested_slot_at) then return new; end if;
 select organization_id into org from public.classes where id=new.class_id;
 if org is not null then perform pg_advisory_xact_lock_shared(hashtextextended('date-booking:'||org::text,0)); end if;
 return new;
end $$;
revoke all on function app.lock_date_booking_organization() from public,anon,authenticated;
create trigger aa_lock_date_booking_organization before insert or update of class_id,class_schedule_id,requested_schedule_block_id,confirmed_schedule_block_id,requested_slot_at,confirmed_slot_at
 on public.trial_applications for each row execute function app.lock_date_booking_organization();

-- New bookings and actual time reassignment only. Same-time confirmation/assignment
-- of an already saved reservation remains permitted, even after an overlay closes.
create function app.enforce_date_booking_application() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.classes; s public.class_schedules; b public.schedule_blocks; starts timestamptz; ends timestamptz; old_start timestamptz; cap int; used int;
begin
 select * into c from public.classes where id=new.class_id for no key update;
 if not found then raise exception 'class_not_available'; end if;
 starts:=coalesce(new.confirmed_slot_at,new.requested_slot_at);
 ends:=app.booking_application_end(new);
 if tg_op='UPDATE' then
  old_start:=coalesce(old.confirmed_slot_at,old.requested_slot_at);
  if new.class_id=old.class_id and starts is not distinct from old_start then return new; end if;
 end if;
 -- Imported records without a reservation time remain history. Assigning a new
 -- time later is checked by this trigger. Parent cannot insert an unknown slot.
 if starts is null and app.current_role() is distinct from 'parent' then return new; end if;
 if starts is null or ends is null or ends<=starts then raise exception 'invalid_schedule_slot'; end if;
 if new.class_schedule_id is not null then
  select * into s from public.class_schedules where id=new.class_schedule_id and class_id=new.class_id;
  if not found or (starts at time zone 'Asia/Seoul')::time<>s.start_time
    or (s.schedule_type='one_time' and (starts at time zone 'Asia/Seoul')::date<>s.specific_date)
    or (s.schedule_type='weekly' and extract(dow from starts at time zone 'Asia/Seoul')<>s.day_of_week) then raise exception 'invalid_schedule_slot'; end if;
  if s.booking_status<>'open' then raise exception 'schedule_booking_closed'; end if;
  cap:=greatest(1,coalesce(s.capacity,1));
  if coalesce(new.confirmed_schedule_block_id,new.requested_schedule_block_id) is not null then
   select * into b from public.schedule_blocks where id=coalesce(new.confirmed_schedule_block_id,new.requested_schedule_block_id);
   if not found or (b.class_id is distinct from new.class_id and not(b.class_id is null and b.teacher_id=c.teacher_id))
     or b.start_at<>starts or b.end_at<>ends or b.type not in ('available','trial_booked')
     or (app.current_role()='parent' and b.type<>'available') then raise exception 'invalid_schedule_slot'; end if;
   cap:=greatest(1,coalesce(b.capacity,1));
  end if;
 else
  select * into b from public.schedule_blocks where id=coalesce(new.confirmed_schedule_block_id,new.requested_schedule_block_id);
  if not found or (b.class_id is distinct from new.class_id and not(b.class_id is null and b.teacher_id=c.teacher_id))
    or b.start_at<>starts or b.type not in ('available','trial_booked') then raise exception 'invalid_schedule_slot'; end if;
  if app.current_role()='parent' and b.type<>'available' then raise exception 'invalid_schedule_slot'; end if;
  cap:=greatest(1,coalesce(b.capacity,1));
 end if;
 if app.is_date_booking_closed(new.class_id,starts,ends) then raise exception 'schedule_date_booking_closed'; end if;
 if app.current_role()='parent' then
  if not c.is_active or c.archived_at is not null then raise exception 'class_not_available'; end if;
  if starts<now()+interval '24 hours' then raise exception 'booking_cutoff_reached'; end if;
  select count(*) into used from public.trial_applications a where a.id<>new.id and a.class_id=new.class_id
   and a.status in ('new','reviewing','confirmed') and coalesce(a.confirmed_slot_at,a.requested_slot_at)=starts;
  if used>=cap then raise exception 'slot_capacity_reached'; end if;
 end if;
 return new;
end $$;
revoke all on function app.enforce_date_booking_application() from public,anon,authenticated;
create trigger zz_enforce_date_booking_application before insert or update of class_id,class_schedule_id,requested_schedule_block_id,confirmed_schedule_block_id,requested_slot_at,confirmed_slot_at
 on public.trial_applications for each row execute function app.enforce_date_booking_application();
notify pgrst,'reload schema';
commit;
