-- DRAFT ONLY: no production approval, fixtures, credentials or activation.
-- Keep outside supabase/migrations until API/catalog/notification integration is ready.
-- No existing data is backfilled; all three registries start empty and access is OFF.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if exists(select 1 from auth.users where raw_app_meta_data->'app_store_review'='true'::jsonb) then raise exception 'app_review_existing_identity_requires_audit'; end if;
  if exists(select 1 from pg_catalog.pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.schedule_blocks'::regclass,'public.trial_applications'::regclass) and not relrowsecurity) then raise exception 'app_review_baseline_rls_disabled'; end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('app.valid_parent_application_initial_context(uuid,uuid,uuid)') and prosecdef and md5(prosrc)='dc15c314f792d386711e35d9cdd072e7') then raise exception 'app_review_baseline_changed: valid_parent_application_initial_context'; end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.lock_class_schedule_application()') and prosecdef and md5(prosrc)='6102861fe1d34b0c1077029f8f748cb6') then raise exception 'app_review_baseline_changed: lock_class_schedule_application'; end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('app.enforce_date_booking_application()') and prosecdef and md5(prosrc)='8ebd8386968ba2cb77ad37db0abef108') then raise exception 'app_review_baseline_changed: enforce_date_booking_application'; end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_parent_feedback_reminders(integer)') and prosecdef and md5(prosrc)='37824bf6dac2815896a503d5f9a0269b') then raise exception 'app_review_baseline_changed: claim_parent_feedback_reminders'; end if;
end;
$preflight$;

create table app.app_store_review_parents (
  parent_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table app.app_store_review_classes (
  class_id uuid primary key references public.classes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  constraint app_store_review_demo_organization_only check
    (organization_id = '29e8c477-dabb-404c-bac4-ba96ffd1e999'::uuid)
);
create table app.app_store_review_grants (
  parent_id uuid not null references app.app_store_review_parents(parent_id) on delete cascade,
  class_id uuid not null references app.app_store_review_classes(class_id) on delete cascade,
  primary key (parent_id,class_id)
);
alter table app.app_store_review_parents enable row level security;
alter table app.app_store_review_classes enable row level security;
alter table app.app_store_review_grants enable row level security;
revoke all on app.app_store_review_parents,app.app_store_review_classes,app.app_store_review_grants from public,anon,authenticated;
grant select,insert,update on app.app_store_review_parents,app.app_store_review_classes to service_role;
grant select,insert,delete on app.app_store_review_grants to service_role;
-- Class membership intentionally cannot be removed with the service API. Its
-- private marker must survive account deletion and keep historic events muted.

create function app.is_app_store_review_parent(p_parent uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app.app_store_review_parents r where r.parent_id=p_parent)
    or exists(select 1 from auth.users u where u.id=p_parent
      and u.raw_app_meta_data->'app_store_review'='true'::jsonb);
$$;
create function app.can_book_app_store_review_class(p_parent uuid,p_class uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app.app_store_review_parents r
    join auth.users u on u.id=r.parent_id
    join public.profiles p on p.id=r.parent_id
    join app.app_store_review_grants g on g.parent_id=r.parent_id
    join app.app_store_review_classes rc on rc.class_id=g.class_id
    join public.classes c on c.id=rc.class_id
    where r.parent_id=p_parent and r.enabled and g.class_id=p_class
      and u.raw_app_meta_data->'app_store_review'='true'::jsonb
      and p.role='parent' and p.organization_id is null
      and not exists(select 1 from public.teachers t where t.profile_id=p_parent)
      and not exists(select 1 from app.parent_account_deletions d where d.parent_id=p_parent)
      and c.organization_id=rc.organization_id and not c.is_active and c.archived_at is null);
$$;
create function app.is_my_app_store_review_parent() returns boolean
language sql stable security definer set search_path='' as $$
  select app.is_app_store_review_parent(auth.uid());
$$;
create function app.is_my_app_store_review_class(p_class uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select app.can_book_app_store_review_class(auth.uid(),p_class);
$$;
create function app.app_store_review_insert_scope(p_class uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select case when app.is_app_store_review_parent(auth.uid())
    then app.can_book_app_store_review_class(auth.uid(),p_class)
    else not exists(select 1 from app.app_store_review_classes where class_id=p_class) end;
$$;
revoke all on function app.is_app_store_review_parent(uuid),app.can_book_app_store_review_class(uuid,uuid),
  app.is_my_app_store_review_parent(),app.is_my_app_store_review_class(uuid),app.app_store_review_insert_scope(uuid)
  from public,anon,authenticated;
grant execute on function app.is_my_app_store_review_parent(),app.is_my_app_store_review_class(uuid),
  app.app_store_review_insert_scope(uuid) to authenticated;

create function app.guard_app_store_review_registry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='app_store_review_parents' then
    if tg_op='UPDATE' and new.parent_id is distinct from old.parent_id then
      raise exception 'app_review_registry_identity_immutable' using errcode='42501';
    end if;
    if tg_op='UPDATE' and not new.enabled then return new; end if;
    -- No existing customers or mixed-role identities may be reclassified.
    if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
        where u.id=new.parent_id and u.raw_app_meta_data->'app_store_review'='true'::jsonb
          and p.role='parent' and p.organization_id is null)
      or exists(select 1 from public.teachers where profile_id=new.parent_id)
      or exists(select 1 from app.parent_account_deletions where parent_id=new.parent_id)
      or (tg_op='INSERT' and exists(select 1 from public.trial_applications where parent_id=new.parent_id))
      then raise exception 'app_review_parent_not_fresh' using errcode='42501'; end if;
  else
    if tg_op='UPDATE' and (new.class_id,new.organization_id) is distinct from (old.class_id,old.organization_id) then
      raise exception 'app_review_registry_identity_immutable' using errcode='42501';
    end if;
    -- Serialize registration against publish/archive/application insertion.
    perform 1 from public.classes where id=new.class_id for update;
    if not exists(select 1 from public.classes c where c.id=new.class_id
        and c.organization_id=new.organization_id and not c.is_active and c.archived_at is null)
      or (tg_op='INSERT' and exists(select 1 from public.trial_applications where class_id=new.class_id))
      then raise exception 'app_review_class_not_private_and_fresh' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
revoke all on function app.guard_app_store_review_registry() from public,anon,authenticated;
create trigger guard_app_store_review_parent_registry before insert or update on app.app_store_review_parents
  for each row execute function app.guard_app_store_review_registry();
create trigger guard_app_store_review_class_registry before insert or update on app.app_store_review_classes
  for each row execute function app.guard_app_store_review_registry();

create function app.guard_app_store_review_class_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from app.app_store_review_classes r where r.class_id=old.id
    and (new.id is distinct from old.id or new.organization_id is distinct from r.organization_id or new.is_active))
    then raise exception 'app_review_class_must_remain_private' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function app.guard_app_store_review_class_privacy() from public,anon,authenticated;
create trigger guard_app_store_review_class_privacy before update on public.classes
  for each row execute function app.guard_app_store_review_class_privacy();

create function app.guard_app_store_review_application() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.parent_id,new.class_id,new.child_id) is not distinct from (old.parent_id,old.class_id,old.child_id) then return new; end if;
  -- Preserve the existing, authorized deletion RPC's detach step. The class
  -- marker remains, so historic records stay suppressed after Auth is removed.
  if tg_op='UPDATE' and new.parent_id is null and new.class_id is not distinct from old.class_id
    and exists(select 1 from app.parent_account_deletions where parent_id=old.parent_id) then return new; end if;
  if tg_op='UPDATE' and not (app.is_app_store_review_parent(old.parent_id)
      or exists(select 1 from app.app_store_review_classes where class_id=old.class_id))
    and (app.is_app_store_review_parent(new.parent_id)
      or exists(select 1 from app.app_store_review_classes where class_id=new.class_id)) then
    raise exception 'app_review_existing_application_cannot_be_reclassified' using errcode='42501';
  end if;
  if app.is_app_store_review_parent(new.parent_id) or exists(select 1 from app.app_store_review_classes where class_id=new.class_id) then
    -- Row locks serialize disable/revoke with a new reservation. No caller-set
    -- session flag, email domain, title prefix or user_metadata grants access.
    perform 1 from app.app_store_review_parents r join app.app_store_review_grants g on g.parent_id=r.parent_id
      where r.parent_id=new.parent_id and g.class_id=new.class_id for share of r,g;
    if not app.can_book_app_store_review_class(new.parent_id,new.class_id)
      or (new.child_id is not null and not exists(select 1 from public.children where id=new.child_id and parent_id=new.parent_id)) then
      raise exception 'app_review_application_scope_forbidden' using errcode='42501'; end if;
  elsif tg_op='UPDATE' and
    (app.is_app_store_review_parent(old.parent_id) or exists(select 1 from app.app_store_review_classes where class_id=old.class_id)) then
    raise exception 'app_review_application_scope_forbidden' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_app_store_review_application() from public,anon,authenticated;
create trigger aaa_guard_app_store_review_application before insert or update of parent_id,class_id,child_id on public.trial_applications
  for each row execute function app.guard_app_store_review_application();

-- Additive policies allow only the caller's explicitly granted private fixtures.
-- Restrictive policies prevent a review parent reading/booking ordinary classes.
create policy app_store_review_class_read on public.classes for select to authenticated
  using(app.is_my_app_store_review_class(id));
create policy app_store_review_class_scope on public.classes as restrictive for select to authenticated
  using(not app.is_my_app_store_review_parent() or app.is_my_app_store_review_class(id));
create policy app_store_review_schedule_read on public.class_schedules for select to authenticated
  using(app.is_my_app_store_review_class(class_id));
create policy app_store_review_schedule_scope on public.class_schedules as restrictive for select to authenticated
  using(not app.is_my_app_store_review_parent() or app.is_my_app_store_review_class(class_id));
create policy app_store_review_block_read on public.schedule_blocks for select to authenticated
  using(app.is_my_app_store_review_class(class_id) and type='available' and start_at>now());
create policy app_store_review_block_scope on public.schedule_blocks as restrictive for select to authenticated
  using(not app.is_my_app_store_review_parent() or app.is_my_app_store_review_class(class_id));
create policy app_store_review_application_insert_scope on public.trial_applications as restrictive for insert to authenticated
  with check(app.app_store_review_insert_scope(class_id));

-- Unchanged signature/privileges; only the inactive-class check differs.
create or replace function app.valid_parent_application_initial_context(p_class uuid, p_child uuid, p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.current_role() = 'parent'
    and exists (select 1 from public.classes c where c.id=p_class and (c.is_active or app.can_book_app_store_review_class(auth.uid(),c.id)) and c.archived_at is null
      and p_teacher is not distinct from (case when c.assignment_mode='preassigned' then c.teacher_id else null end))
    and (p_child is null or exists (select 1 from public.children ch where ch.id=p_child and ch.parent_id=auth.uid()));
$$;

-- Unchanged signature/privileges; only the inactive-class check differs.
create or replace function public.lock_class_schedule_application() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.classes;
begin
 if tg_op='INSERT' or new.class_id is distinct from old.class_id or new.class_schedule_id is distinct from old.class_schedule_id then
   select * into c from public.classes where id=new.class_id for no key update;
   if not found then raise exception 'class_not_available'; end if;
   if (tg_op='INSERT' or new.class_id is distinct from old.class_id) and
     (c.archived_at is not null or (app.current_role()='parent' and not c.is_active and not app.can_book_app_store_review_class(new.parent_id,c.id))) then raise exception 'class_not_available'; end if;
   if new.class_schedule_id is not null and not exists(select 1 from public.class_schedules where id=new.class_schedule_id and class_id=new.class_id)
     then raise exception 'class_schedule_not_found'; end if;
 end if;
 return new;
end $$;

-- Unchanged signature/privileges; only the inactive-class check differs.
create or replace function app.enforce_date_booking_application() returns trigger
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
  if (not c.is_active and not app.can_book_app_store_review_class(new.parent_id,c.id)) or c.archived_at is not null then raise exception 'class_not_available'; end if;
  if starts<now()+interval '24 hours' then raise exception 'booking_cutoff_reached'; end if;
  select count(*) into used from public.trial_applications a where a.id<>new.id and a.class_id=new.class_id
   and a.status in ('new','reviewing','confirmed') and coalesce(a.confirmed_slot_at,a.requested_slot_at)=starts;
  if used>=cap then raise exception 'slot_capacity_reached'; end if;
 end if;
 return new;
end $$;

create function public.get_my_app_store_review_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',count(*)>0,'classIds',coalesce(jsonb_agg(g.class_id order by g.class_id),'[]'::jsonb))
  from app.app_store_review_grants g where g.parent_id=auth.uid()
    and app.can_book_app_store_review_class(auth.uid(),g.class_id);
$$;
revoke all on function public.get_my_app_store_review_access() from public,anon,authenticated;
grant execute on function public.get_my_app_store_review_access() to authenticated;

create function app.app_store_review_notification_suppressed(p_application uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trial_applications a where a.id=p_application
    and (app.is_app_store_review_parent(a.parent_id)
      or exists(select 1 from app.app_store_review_classes c where c.class_id=a.class_id)));
$$;
revoke all on function app.app_store_review_notification_suppressed(uuid) from public,anon,authenticated;
-- The server must call this before ANY direct provider request. Unknown is not
-- permission to send. This SQL alone cannot intercept an existing HTTP sender.
create function public.get_app_store_review_notification_policy(p_application_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when not exists(select 1 from public.trial_applications where id=p_application_id) then 'unknown'
    when app.app_store_review_notification_suppressed(p_application_id) then 'suppress' else 'normal' end;
$$;
revoke all on function public.get_app_store_review_notification_policy(uuid) from public,anon,authenticated;
grant execute on function public.get_app_store_review_notification_policy(uuid) to service_role;

create function app.suppress_app_store_review_push_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if app.is_app_store_review_parent(new.parent_id) or app.app_store_review_notification_suppressed(new.application_id)
    or (tg_op='UPDATE' and (app.is_app_store_review_parent(old.parent_id) or app.app_store_review_notification_suppressed(old.application_id))) then
    new.state:='test_suppressed';new.suppress_legacy:=true;new.attempts:='[]'::jsonb;new.reason:='app_store_review';
    if tg_table_name='parent_event_push_deliveries' then new.feedback_completed:=true; end if;
  end if;
  return new;
end;
$$;
revoke all on function app.suppress_app_store_review_push_job() from public,anon,authenticated;
create trigger app_store_review_confirmed_push_guard before insert or update on public.parent_confirmed_push_deliveries
  for each row execute function app.suppress_app_store_review_push_job();
create trigger app_store_review_event_push_guard before insert or update on public.parent_event_push_deliveries
  for each row execute function app.suppress_app_store_review_push_job();

create or replace function public.claim_parent_feedback_reminders(p_limit integer default 500)
returns table(
  application_id uuid,
  organization_id uuid,
  class_id uuid,
  parent_id uuid,
  parent_name text,
  parent_phone text,
  student_name text,
  academy_name text,
  class_title text,
  requested_slot_at timestamptz,
  confirmed_slot_at timestamptz,
  selected_schedule_label text
) language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'feedback_reminder_invalid_limit';
  end if;

  return query
  with candidates as (
    select e.application_id
    from public.parent_report_engagement e
    join public.trial_applications a on a.id=e.application_id and a.parent_id=e.parent_id
    join public.classes c on c.id=a.class_id
    join public.organizations o on o.id=c.organization_id
    where e.feedback_reminder_sent_at is null
      and not app.app_store_review_notification_suppressed(a.id)
      and e.report_first_viewed_at <= now()-interval '24 hours'
      and (e.feedback_reminder_claimed_at is null
        or e.feedback_reminder_claimed_at <= now()-interval '15 minutes')
      and a.status='completed' and a.canceled_at is null and a.no_show_at is null
      and exists(select 1 from public.experience_reports r
        where r.application_id=a.id and r.status='published')
      and not (
        exists(select 1 from public.experience_feedback f where f.application_id=a.id)
        and exists(select 1 from public.parent_decisions d
          where d.application_id=a.id and d.superseded_at is null)
      )
    order by e.report_first_viewed_at,e.application_id
    limit p_limit
    for update of e skip locked
  ), claimed as (
    update public.parent_report_engagement e
    set feedback_reminder_claimed_at=now(),
        feedback_reminder_attempted_at=now(),
        feedback_reminder_last_error=null
    from candidates c
    where e.application_id=c.application_id and e.feedback_reminder_sent_at is null
    returning e.application_id
  )
  select a.id,c.organization_id,a.class_id,a.parent_id,a.parent_name,a.parent_phone,
    a.child_name,o.name,c.title,a.requested_slot_at,a.confirmed_slot_at,a.selected_schedule_label
  from claimed q
  join public.trial_applications a on a.id=q.application_id
  join public.classes c on c.id=a.class_id
  join public.organizations o on o.id=c.organization_id
  order by a.id;
end;
$$;

-- No registry entries, accounts, classes, applications, delivery settings or
-- migration history rows are written here. Separate approval is still required
-- for production application, fixtures, API deployment and activation.
notify pgrst,'reload schema';
commit;
