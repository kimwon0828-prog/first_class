-- Run ONLY against an isolated migrated database. Every fixture is rolled back.
\set ON_ERROR_STOP on
begin;
insert into public.organizations(id,name) values
 ('20000000-0000-4000-8000-000000000001','Rolling test'),('20000000-0000-4000-8000-000000000002','Other test');
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000010','rolling-test@example.invalid');
insert into public.profiles(id,role,name,organization_id)
 values('20000000-0000-4000-8000-000000000010','academy','Rolling tester','20000000-0000-4000-8000-000000000001')
 on conflict(id) do update set role=excluded.role,organization_id=excluded.organization_id;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000010',true);

do $$
declare today date := (now() at time zone 'Asia/Seoul')::date; c uuid; fixed uuid; legacy uuid;
  rule jsonb; fields jsonb; slots jsonb; n int; ids uuid[]; protected uuid; hidden uuid; capped uuid; removed uuid;
  previous_rule public.class_operating_rules; sid uuid; old_count int; exception_date date; past_ids uuid[];
begin
  select jsonb_agg(jsonb_build_object('weekday',i,'startTime','23:00','endTime','23:30','capacity',3,
    'seriesId','20000000-0000-4000-8000-000000000050')) into slots from generate_series(0,6) i;
  rule := jsonb_build_object('operationType','rolling','startDate',today,'endDate',null,'slots',slots);
  fields := jsonb_build_object('organization_id','20000000-0000-4000-8000-000000000001','title','Rolling test class',
    'subject','piano','target_age','elem_1','description','Isolated rolling schedule fixture','is_active',true,'trial_price',10000);
  select id into c from public.save_studio_class_operating_rule(null,fields,rule,0);
  select array_agg(id order by specific_date) into ids from public.class_schedules where class_id=c;
  assert array_length(ids,1) between 89 and 90, 'A/B first rolling window';
  assert (select max(specific_date)=today+89 from public.class_schedules where class_id=c), 'B horizon';
  perform public.extend_rolling_class_schedule(c);
  assert (select array_agg(id order by specific_date)=ids from public.class_schedules where class_id=c), 'D idempotence and stable IDs';
  n := public.reconcile_class_operating_rule(c,today+1,false);
  assert n=1 and (select max(specific_date)=today+90 from public.class_schedules where class_id=c), 'C next-day refill';
  assert public.reconcile_class_operating_rule(c,today+1,false)=0, 'D repeated next-day refill';

  select id into protected from public.class_schedules where class_id=c and specific_date=today+1;
  insert into public.trial_applications(class_id,class_schedule_id,child_name,child_grade,requested_slot_at,status)
    values(c,protected,'Fixture child','elem_1',(today+1)::timestamp at time zone 'Asia/Seoul','new');
  select id into hidden from public.class_schedules where class_id=c and specific_date=today+2;
  update public.class_schedules set booking_status='hidden' where id=hidden;
  select id into capped from public.class_schedules where class_id=c and specific_date=today+3;
  update public.class_schedules set capacity=7 where id=capped;
  perform public.set_class_schedule_date_exception(c,today+4,'closed');
  -- A closed date beyond the horizon must still apply when that date is generated.
  perform public.set_class_schedule_date_exception(c,today+91,'hidden');
  select id into removed from public.class_schedules where class_id=c and specific_date=today+5;
  delete from public.class_schedules where id=removed;
  perform public.extend_rolling_class_schedule(c);
  assert not exists(select 1 from public.class_schedules where class_id=c and specific_date=today+5), 'deleted slot tombstone';
  select id into sid from public.class_schedules where class_id=c and specific_date=today+6;
  update public.class_schedules set start_time='21:00',end_time='21:30' where id=sid;
  perform public.extend_rolling_class_schedule(c);
  assert exists(select 1 from public.class_schedules where id=sid and start_time='21:00' and is_manual_override), 'moved slot keeps ID';
  assert not exists(select 1 from public.class_schedules where class_id=c and specific_date=today+6 and start_time='23:00'), 'moved slot original position tombstone';

  -- Represent history, including no-show recorded as canceled + no_show_at, without changing the status contract.
  for n in 1..3 loop
    insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity)
      values(c,'one_time',today-n,'10:00','11:00',2) returning id into sid;
    past_ids:=array_append(past_ids,sid);
    insert into public.trial_applications(class_id,class_schedule_id,child_name,child_grade,requested_slot_at,status,no_show_at)
      values(c,sid,'Past fixture','elem_1',(today-n)::timestamp at time zone 'Asia/Seoul',
        case when n=1 then 'completed' else 'canceled' end,case when n=3 then now() else null end);
  end loop;
  select * into previous_rule from public.class_operating_rules where class_id=c;
  -- I/J: new weekdays AND new time. Existing reservation, hidden, capacity override and closed date survive.
  select jsonb_agg(jsonb_build_object('weekday',i,'startTime','16:00','endTime','17:00','capacity',4,
    'seriesId','20000000-0000-4000-8000-000000000060')) into slots from generate_series(0,6) i where i in (2,4);
  rule:=jsonb_set(rule,'{slots}',slots);
  perform public.save_studio_class_operating_rule(c,fields,rule,previous_rule.revision);
  assert exists(select 1 from public.class_schedules where id=protected and start_time='23:00'), 'E protected ID';
  assert exists(select 1 from public.class_schedules where id=hidden and booking_status='hidden'), 'G hidden';
  assert exists(select 1 from public.class_schedules where id=capped and capacity=7), 'H capacity';
  assert not exists(select 1 from public.class_schedules where class_id=c and specific_date=today+4 and booking_status<>'closed'), 'F date close';
  assert exists(select 1 from public.class_schedules where class_id=c and start_time='16:00'
    and extract(dow from specific_date) in (2,4)), 'I/J new pattern';
  assert (select count(*)=3 from public.class_schedules where id=any(past_ids)), 'N history';
  assert (select count(*)=3 from public.trial_applications where class_schedule_id=any(past_ids)), 'N reference intact';
  begin
    delete from public.class_schedules where id=protected;
    raise exception 'reservation deletion was allowed';
  exception when others then
    if sqlerrm<>'protected_class_schedule_change_blocked' then raise; end if;
  end;
  begin
    perform public.save_studio_class_operating_rule(c,fields || '{"title":"SHOULD ROLLBACK"}',rule,previous_rule.revision);
    raise exception 'stale revision accepted';
  exception when others then
    if sqlerrm<>'operating_rule_revision_conflict' then raise; end if;
  end;
  assert (select title<>'SHOULD ROLLBACK' from public.classes where id=c), 'atomic fields and rule';
  begin
    perform public.save_studio_class_operating_rule(c,fields || '{"title":"INVALID RULE ROLLBACK"}',
      jsonb_set(rule,'{slots}','[]'),previous_rule.revision+1);
    raise exception 'invalid rule accepted';
  exception when others then if sqlerrm<>'invalid_operating_rule_slots' then raise; end if; end;
  assert (select title<>'INVALID RULE ROLLBACK' from public.classes where id=c), 'rollback after class update';

  -- K/L: private creation and pause/republication.
  update public.classes set is_active=false where id=c;
  select count(*) into old_count from public.class_schedules where class_id=c;
  assert public.reconcile_class_operating_rule(c,today+30,false)=0, 'K private pause';
  assert (select count(*)=old_count from public.class_schedules where class_id=c), 'K retains schedules';
  perform set_config('app.rolling_writer','on',true);
  delete from public.class_schedules where class_id=c and specific_date>today+60 and not is_manual_override;
  perform set_config('app.rolling_writer','',true);
  update public.classes set is_active=true where id=c;
  assert exists(select 1 from public.class_schedules where class_id=c and specific_date>today+80), 'L republish refills';
  perform public.reconcile_class_operating_rule(c,today+3,false);
  assert not exists(select 1 from public.class_schedules where class_id=c and specific_date=today+91 and booking_status<>'hidden'), 'future date exception';

  rule:=jsonb_set(rule,'{operationType}','"fixed_period"');
  rule:=jsonb_set(rule,'{endDate}',to_jsonb((today+20)::text));
  select id into fixed from public.save_studio_class_operating_rule(null,fields,rule,0);
  select count(*) into old_count from public.class_schedules where class_id=fixed;
  assert public.extend_rolling_class_schedule(fixed)=0, 'M fixed not rolled';
  assert (select count(*)=old_count and max(specific_date)<=today+20 from public.class_schedules where class_id=fixed), 'M fixed boundary';

  insert into public.classes(organization_id,title,subject,target_age,description,is_active)
    values('20000000-0000-4000-8000-000000000001','Legacy','piano','elem_1','legacy fixture',true) returning id into legacy;
  insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity)
    values(legacy,'one_time',today+10,'10:00','11:00',2) returning id into sid;
  assert public.extend_rolling_class_schedule(legacy)=0, 'legacy no inference';
  perform public.save_studio_class_operating_rule(legacy,fields,rule,0);
  assert exists(select 1 from public.class_schedules where id=sid and generated_by_rule_id is null), 'explicit adoption retains legacy';
  raise notice 'PASS A-N, atomic rollback, revision conflict, manual deletion, future date exceptions, legacy preservation';
end $$;

-- Use actual authenticated role + JWT identity, including unauthorized RPC and direct table writes.
set local role authenticated;
do $$
declare c uuid; r jsonb;
begin
  r:=jsonb_build_object('operationType','rolling','startDate',(now() at time zone 'Asia/Seoul')::date,'endDate',null,
    'slots',jsonb_build_array(jsonb_build_object('weekday',1,'startTime','10:00','endTime','11:00','capacity',3,'seriesId',gen_random_uuid())));
  select id into c from public.save_studio_class_operating_rule(null,
    '{"organization_id":"20000000-0000-4000-8000-000000000001","title":"Private fixture","subject":"piano","target_age":"elem_1","description":"private fixture","is_active":false}',r,0);
  assert not exists(select 1 from public.class_schedules where class_id=c), 'private CREATE stores rule without automatic generation';
  update public.classes set is_active=true where id=c;
  assert exists(select 1 from public.class_schedules where class_id=c), 'authenticated republish trigger';
  begin
    perform public.save_studio_class_operating_rule(null,
      '{"organization_id":"20000000-0000-4000-8000-000000000002","title":"forbidden"}',null,0);
    raise exception 'cross org write allowed';
  exception when others then if sqlerrm<>'studio_class_not_found_or_forbidden' then raise; end if; end;
  begin
    perform public.extend_rolling_class_schedule(gen_random_uuid());
    raise exception 'cron callable by studio';
  exception when insufficient_privilege then null; end;
  begin
    update public.class_operating_rules set is_active=false;
    raise exception 'direct rule writes allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS authenticated ownership, service-only cron, read-only rule grants';
end $$;
reset role;
rollback;
