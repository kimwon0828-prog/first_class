-- Isolated migrated DB only; synthetic fixtures and all writes roll back.
\set ON_ERROR_STOP on
begin;
insert into public.organizations(id,name) values ('27000000-0000-4000-8000-000000000001','[TEST] Regular tuition');
insert into auth.users(id,email) values ('27000000-0000-4000-8000-000000000010','tuition@example.invalid');
insert into public.profiles(id,role,name,organization_id)
values ('27000000-0000-4000-8000-000000000010','academy','Tuition fixture','27000000-0000-4000-8000-000000000001')
on conflict(id) do update set role=excluded.role, organization_id=excluded.organization_id;
select set_config('request.jwt.claim.sub','27000000-0000-4000-8000-000000000010',true);
set local role authenticated;
do $$
declare c uuid; fields jsonb; rule jsonb; ids uuid[]; price_type text; bad jsonb;
begin
  fields := jsonb_build_object('organization_id','27000000-0000-4000-8000-000000000001',
    'title','[TEST] Tuition','subject','piano','target_age','elem_1','description','Synthetic tuition fixture',
    'program_type','trial_class','trial_price',10000,'is_active',true,
    'regular_price_type','monthly','regular_price_amount',180000,'regular_price_note','주 2회 기준');
  rule := jsonb_build_object('operationType','rolling','startDate',(now() at time zone 'Asia/Seoul')::date,'endDate',null,
    'slots',jsonb_build_array(jsonb_build_object('weekday',1,'startTime','15:00','endTime','16:00','capacity',3,'seriesId',gen_random_uuid())));
  select id into c from public.save_studio_class_operating_rule(null,fields,rule,0);
  assert (select regular_price_amount=180000 and regular_price_type='monthly' and regular_price_note='주 2회 기준' and trial_price=10000 from public.classes where id=c), 'CREATE roundtrip';
  select array_agg(id order by id) into ids from public.class_schedules where class_id=c;
  assert array_length(ids,1)>0, 'rolling generated';
  perform public.save_studio_class_operating_rule(c, fields || '{"regular_price_type":"consultation","regular_price_amount":null}'::jsonb, null,0);
  assert (select regular_price_amount is null and regular_price_type='consultation' from public.classes where id=c), 'consultation clears amount';
  assert (select array_agg(id order by id)=ids from public.class_schedules where class_id=c), 'price-only save preserves schedules';
  perform public.save_studio_class_operating_rule(c, fields || '{"regular_price_type":null,"regular_price_amount":null,"regular_price_note":null}'::jsonb,null,0);
  assert (select regular_price_type is null and regular_price_amount is null and regular_price_note is null from public.classes where id=c), 'remove all fields';
  foreach price_type in array array['monthly','per_session'] loop
    perform public.save_studio_class_operating_rule(c,fields || jsonb_build_object('regular_price_type',price_type,'regular_price_amount',0),null,0);
    assert (select regular_price_amount=0 from public.classes where id=c), 'zero amount accepted';
  end loop;
  for bad in select value from jsonb_array_elements('[
    {"regular_price_type":"monthly","regular_price_amount":null},
    {"regular_price_type":"per_session","regular_price_amount":-1},
    {"regular_price_type":"consultation","regular_price_amount":1},
    {"regular_price_type":null,"regular_price_amount":1},
    {"regular_price_type":"yearly","regular_price_amount":1}]'::jsonb) loop
    begin
      perform public.save_studio_class_operating_rule(c,fields || bad,null,0);
      raise exception 'invalid price accepted: %',bad;
    exception when check_violation then null; end;
  end loop;
  begin
    perform public.save_studio_class_operating_rule(c,fields || jsonb_build_object('regular_price_note',repeat('가',121)),null,0);
    raise exception 'oversized note accepted';
  exception when check_violation then null; end;
  -- Legacy save path (no operating rule) supports the same columns.
  insert into public.classes(organization_id,title,subject,target_age,description,trial_price,is_active,regular_price_type,regular_price_amount)
    values ('27000000-0000-4000-8000-000000000001','Legacy tuition','piano','elem_1','Legacy fixture',0,false,'per_session',35000)
    returning id into c;
  update public.classes set regular_price_type='consultation',regular_price_amount=null where id=c;
  assert not exists(select 1 from public.class_operating_rules where class_id=c), 'legacy not adopted';
  raise notice 'PASS regular tuition DB: authenticated CREATE/UPDATE, null/zero/checks, legacy, stable rolling schedule IDs';
end $$;
reset role;
rollback;
