-- CLASS LIFECYCLE V1: COMPAT / EXPANSION.
-- Safe before the new application deploy: NO replacement of existing functions,
-- NO existing privilege revocation, NO direct DELETE guard, NO generation changes.
-- During this rollout interval use read-only QA; do not archive real classes yet.
begin;
alter table public.classes add column archived_at timestamptz;
-- Existing organization index is sufficient; no speculative new index.

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


notify pgrst, 'reload schema';
commit;
