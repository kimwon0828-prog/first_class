-- Executed only by the local rehearsal runner. Each contract fixture rolls back.
begin;
insert into public.organizations(id,name) values('41000000-0000-4000-8000-000000000001','Local compatibility fixture');
insert into auth.users(id,email) values('41000000-0000-4000-8000-000000000010','local-compat@example.invalid');
insert into public.profiles(id,role,name,organization_id) values('41000000-0000-4000-8000-000000000010','academy','Local compatibility fixture','41000000-0000-4000-8000-000000000001') on conflict(id) do update set role=excluded.role,organization_id=excluded.organization_id;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000010',true);
set local role authenticated;
do $$
declare c uuid; d date := (now() at time zone 'Asia/Seoul')::date+2; fields jsonb; rule jsonb; n int;
 phase text := current_setting('app.rehearsal_phase'); before_snapshot jsonb;
begin
 fields:=jsonb_build_object('organization_id','41000000-0000-4000-8000-000000000001','title','Compat fixed private','subject','piano','target_age','elem_3','description','Local only','assignment_mode','post_assign','is_active',false);
 rule:=jsonb_build_object('operationType','fixed_period','startDate',d,'endDate',d+6,'slots',
 (select jsonb_agg(jsonb_build_object('weekday',i,'startTime','15:00','endTime','16:00','capacity',3,'seriesId','41000000-0000-4000-8000-000000000050')) from generate_series(0,6)i));
 select id into c from public.save_studio_class_operating_rule(null,fields,rule,0);
 select count(*) into n from public.class_schedules where class_id=c;
 assert n=7,'private fixed_period must generate the exact seven-day period';
 -- Save exact occurrence values; generated UUIDs intentionally excluded from comparison.
 perform set_config('app.fixture_occurrences',(select jsonb_agg(jsonb_build_array(specific_date,start_time,end_time,capacity,booking_status) order by specific_date)::text from public.class_schedules where class_id=c),false);
 if phase='baseline' then return; end if;
 assert (select archived_at is null from public.classes where id=c),'COMPAT archived_at readable and NULL';
 assert (select can_permanently_delete from public.get_studio_class_delete_eligibility() where class_id=c),'generated-only is eligible';
 perform public.mutate_studio_class_lifecycle(c,'delete');
 assert not exists(select 1 from public.classes where id=c),'new RPC deletes empty generated class';

 -- Exact legacy cleanup: class_schedules DELETE, then classes DELETE without the RPC flag.
 insert into public.classes(organization_id,title,subject,target_age,description,is_active,assignment_mode)
 values('41000000-0000-4000-8000-000000000001','Legacy failed create','piano','elem_3','Local only',false,'post_assign') returning id into c;
 insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity)
 values(c,'one_time',d,'10:00','11:00',2);
 if phase='compat' then
   delete from public.class_schedules where class_id=c;
   delete from public.classes where id=c;
   assert not exists(select 1 from public.classes where id=c),'legacy direct cleanup succeeds';
 else
   begin
     delete from public.classes where id=c;
     raise exception 'raw delete unexpectedly allowed';
   exception when others then if sqlerrm<>'class_delete_requires_lifecycle_rpc' then raise; end if; end;
   perform public.mutate_studio_class_lifecycle(c,'delete');
 end if;

 -- Private rolling remains paused in every phase.
 rule:=jsonb_set(jsonb_set(rule,'{operationType}','"rolling"'),'{endDate}','null');
 select id into c from public.save_studio_class_operating_rule(null,fields,rule,0);
 assert not exists(select 1 from public.class_schedules where class_id=c),'private rolling pause retained';
 update public.classes set is_active=true where id=c;
 assert exists(select 1 from public.class_schedules where class_id=c),'publish refills with original trigger';
 select jsonb_agg(to_jsonb(s) order by id) into before_snapshot from public.class_schedules s where class_id=c;
 perform public.mutate_studio_class_lifecycle(c,'archive');
 assert (select archived_at is not null and not is_active from public.classes where id=c),'archive atomic state';
 assert (select jsonb_agg(to_jsonb(s) order by id) from public.class_schedules s where class_id=c)=before_snapshot,'archive preserves schedules';
 if phase='hardening' then
   begin update public.classes set is_active=true where id=c; raise exception 'publish unexpectedly allowed';
   exception when others then if sqlerrm<>'class_restore_required' then raise; end if; end;
   begin insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity) values(c,'one_time',d,'17:00','18:00',2); raise exception 'manual generation allowed';
   exception when others then if sqlerrm<>'class_restore_required' then raise; end if; end;
 end if;
 perform public.mutate_studio_class_lifecycle(c,'restore');
 assert (select archived_at is null and not is_active from public.classes where id=c),'restore private';
 assert (select jsonb_agg(to_jsonb(s) order by id) from public.class_schedules s where class_id=c)=before_snapshot,'restore preserves schedules';

 perform public.mutate_studio_class_lifecycle(c,'archive');
 perform set_config('app.archived_fixture',c::text,true);
end $$;
reset role;
do $$ declare c uuid; phase text:=current_setting('app.rehearsal_phase'); begin
 if phase='baseline' then return; end if;
 c:=current_setting('app.archived_fixture')::uuid;
 if phase='hardening' then
   assert public.reconcile_class_operating_rule(c,(now() at time zone 'Asia/Seoul')::date+80,true)=0,'archived reconcile/generation zero';
   assert public.extend_rolling_class_schedule(c)=0,'archived cron/refill zero';
   -- Also fixed_period archived: early return before any reconcile deletion or generation.
   perform public.mutate_studio_class_lifecycle(c,'restore');
   update public.class_operating_rules set operation_type='fixed_period',end_date=start_date+6 where class_id=c;
   perform public.mutate_studio_class_lifecycle(c,'archive');
   assert public.reconcile_class_operating_rule(c,(now() at time zone 'Asia/Seoul')::date+80,true)=0,'archived fixed generation zero';
   begin insert into public.trial_applications(class_id,child_name,child_grade,requested_slot_at) values(c,'Local child','elem_3',now()+interval '2 days'); raise exception 'archived application allowed';
   exception when others then if sqlerrm<>'class_not_available' then raise; end if; end;
 end if;
 perform public.mutate_studio_class_lifecycle(c,'restore');
 insert into public.trial_applications(class_id,child_name,child_grade,requested_slot_at,status) values(c,'Local child','elem_3',now()+interval '2 days','completed');
 begin perform public.mutate_studio_class_lifecycle(c,'delete'); raise exception 'history delete allowed';
 exception when others then if sqlerrm<>'class_has_operating_history' then raise; end if; end;
 perform public.mutate_studio_class_lifecycle(c,'archive');
 assert exists(select 1 from public.trial_applications where class_id=c),'archived history preserved';
end $$;
select current_setting('app.fixture_occurrences');
rollback;
