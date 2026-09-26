-- Display-only tuition. Existing rows stay NULL; no data backfill.
alter table public.classes
  add column regular_price_type text,
  add column regular_price_amount integer,
  add column regular_price_note text,
  add constraint classes_regular_price_check check (
    (regular_price_type is null and regular_price_amount is null)
    or (regular_price_type is not null and (
      (regular_price_type in ('monthly', 'per_session') and regular_price_amount is not null and regular_price_amount >= 0)
      or (regular_price_type = 'consultation' and regular_price_amount is null)
    ))
  ),
  add constraint classes_regular_price_note_length check (char_length(regular_price_note) <= 120);

-- The managed class save RPC accepts the same three fields. Ownership, locks,
-- grants, schedule reconciliation and booking protection remain unchanged.
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
