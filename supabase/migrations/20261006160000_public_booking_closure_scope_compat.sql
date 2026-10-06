begin;
-- NULL marks existing records. No reclassification or backfill of legacy closures.
alter table public.date_booking_closures add column selection_scope text
 check (selection_scope in ('public','class'));

-- Keep v1 RPCs unchanged for existing clients during COMPAT -> APP READY.
create function public.get_studio_booking_day_v2(p_date date,p_organization_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 payload:=public.get_studio_booking_day(p_date,p_organization_id);
 return jsonb_set(payload,'{closures}',coalesce((select jsonb_agg(j.value||jsonb_build_object('selectionScope',x.selection_scope))
  from jsonb_array_elements(payload->'closures') j join public.date_booking_closures x on x.id=(j.value->>'id')::uuid),'[]'));
end $$;
revoke all on function public.get_studio_booking_day_v2(date,uuid) from public,anon;
grant execute on function public.get_studio_booking_day_v2(date,uuid) to authenticated;

create function public.mutate_studio_booking_closures_v2(p_date date,p_class_id uuid,p_mode text,p_slot_keys text[],p_expected_targets text[],p_closure_ids uuid[] default '{}',p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=app.current_org_id(); actor uuid:=auth.uid(); occurrences jsonb; windows jsonb; targets text[]; changed int:=0; n int; selected_window record;
begin
 if actor is null or org is null or coalesce(app.current_role(),'') not in ('teacher','operator') then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('close','release') or p_date is null or p_date<(now() at time zone 'Asia/Seoul')::date
  or p_slot_keys is null or p_expected_targets is null or cardinality(p_slot_keys)>200 or cardinality(p_expected_targets)>10000
  or (p_mode='close' and cardinality(p_slot_keys)=0) or char_length(p_reason)>500
  or (select count(distinct k) from unnest(p_slot_keys)k)<>cardinality(p_slot_keys)
  then raise exception 'invalid_booking_request'; end if;
 if p_class_id is not null and not exists(select 1 from public.classes where id=p_class_id and organization_id=org)
  then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
 -- Same lock order as v1 and the final application INSERT/reassignment guards.
 perform pg_advisory_xact_lock(hashtextextended('date-booking:'||org::text,0));
 perform 1 from public.classes c where c.organization_id=org order by c.id for no key update;
 -- One materialized snapshot: target verification and inserts use the same set.
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('key',o.class_id::text||'/'||o.source||'/'||o.id::text,'is_public',c.is_active and c.archived_at is null)),'[]') into occurrences
 from app.booking_occurrences_on(org,p_date)o join public.classes c on c.id=o.class_id and c.organization_id=org;
 if p_mode='close' then
  if cardinality(p_slot_keys)<>(select count(*) from jsonb_array_elements(occurrences)o where (o->>'key')=any(p_slot_keys)
   and (p_class_id is null or (o->>'class_id')::uuid=p_class_id) and (o->>'is_public')::boolean)
   then raise exception 'booking_slots_changed'; end if;
  select jsonb_agg(o) into windows from jsonb_array_elements(occurrences)o where (o->>'key')=any(p_slot_keys);
 else
  if coalesce(cardinality(p_closure_ids),0)=0 or cardinality(p_closure_ids)>500 or cardinality(p_slot_keys)<>0 then raise exception 'invalid_booking_request'; end if;
  -- Explicit IDs allow orphan/private and legacy academy-wide releases, independently.
  -- Released records remain valid retry sources; no other closure is released.
  if (select count(distinct i) from unnest(p_closure_ids)i)<>(select count(*) from public.date_booking_closures x where x.id=any(p_closure_ids)
   and x.organization_id=org and x.specific_date=p_date and (p_class_id is null or x.class_id=p_class_id))
   then raise exception 'booking_scope_forbidden' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object('start_at',x.start_at,'end_at',x.end_at,'class_id',x.class_id)) into windows
   from public.date_booking_closures x where x.id=any(p_closure_ids);
 end if;
 select coalesce(array_agg(distinct o->>'key' order by o->>'key'),'{}') into targets from jsonb_array_elements(occurrences)o
 where (p_mode='release' or ((o->>'is_public')::boolean and (p_class_id is null or (o->>'class_id')::uuid=p_class_id)))
 and exists(select 1 from jsonb_array_elements(windows)w where (w->>'start_at')::timestamptz<(o->>'end_at')::timestamptz and (w->>'end_at')::timestamptz>(o->>'start_at')::timestamptz
  and (p_mode='close' or w->>'class_id' is null or w->>'class_id'=o->>'class_id'));
 if targets is distinct from (select coalesce(array_agg(distinct k order by k),'{}') from unnest(p_expected_targets)k)
  then raise exception 'booking_slots_changed'; end if;
 if p_mode='close' then
  -- Snapshot all-public selection as course overlays. Never write class_id=NULL:
  -- private/newly published courses cannot inherit a new all-public closure.
  for selected_window in select distinct (o->>'class_id')::uuid class_id,(w->>'start_at')::timestamptz start_at,(w->>'end_at')::timestamptz end_at
   from jsonb_array_elements(occurrences)o cross join jsonb_array_elements(windows)w
   where (o->>'key')=any(targets) and (w->>'start_at')::timestamptz<(o->>'end_at')::timestamptz and (w->>'end_at')::timestamptz>(o->>'start_at')::timestamptz loop
   insert into public.date_booking_closures(organization_id,class_id,specific_date,start_at,end_at,reason,created_by,selection_scope)
    values(org,selected_window.class_id,p_date,selected_window.start_at,selected_window.end_at,nullif(btrim(p_reason),''),actor,case when p_class_id is null then 'public' else 'class' end) on conflict do nothing;
   get diagnostics n=row_count; changed:=changed+n;
  end loop;
 else
  update public.date_booking_closures set released_at=now(),released_by=actor where id=any(p_closure_ids) and released_at is null;
  get diagnostics changed=row_count;
 end if;
 return jsonb_build_object('changed',changed,'targetCount',cardinality(targets));
end $$;
revoke all on function public.mutate_studio_booking_closures_v2(date,uuid,text,text[],text[],uuid[],text) from public,anon;
grant execute on function public.mutate_studio_booking_closures_v2(date,uuid,text,text[],text[],uuid[],text) to authenticated;
notify pgrst,'reload schema';
commit;
