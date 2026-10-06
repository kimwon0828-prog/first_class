begin;
-- Apply only after the app uses v2; keeps legacy release while preventing a
-- stale/direct v1 close from creating new academy-wide overlays.
create or replace function public.mutate_studio_booking_closures(p_date date,p_class_id uuid,p_mode text,p_slot_keys text[],p_expected_targets text[],p_closure_ids uuid[] default '{}',p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=app.current_org_id(); actor uuid:=auth.uid(); targets text[]; changed int:=0; n int; selected_window record;
begin
 -- APP READY: stale clients use the same final scope validation for NEW closes.
 -- Existing v1 release semantics and authorization below are unchanged.
 if p_mode='close' then
  return public.mutate_studio_booking_closures_v2(p_date,p_class_id,p_mode,p_slot_keys,p_expected_targets,p_closure_ids,p_reason);
 end if;
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
notify pgrst,'reload schema';
commit;
