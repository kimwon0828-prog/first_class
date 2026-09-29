-- READ ONLY. No row identifiers, names, contact details or note text are returned.
begin read only;
select jsonb_build_object(
  'status_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.trial_applications group by status) s),
  'completed_rows',(select count(*) from public.trial_applications where status='completed'),
  'completed_cancel_or_no_show',(select count(*) from public.trial_applications where status='completed' and (canceled_at is not null or no_show_at is not null)),
  'completed_without_parent',(select count(*) from public.trial_applications where status='completed' and parent_id is null),
  'broken_class_or_organization',(select count(*) from public.trial_applications a left join public.classes c on c.id=a.class_id left join public.organizations o on o.id=c.organization_id where c.id is null or o.id is null),
  'program_types',(select jsonb_object_agg(program_type,n) from (select program_type,count(*) n from public.classes group by program_type) p),
  'parent_decision_counts',(select jsonb_build_object('all',count(*),'current',count(*) filter(where superseded_at is null),'history',count(*) filter(where superseded_at is not null)) from public.parent_decisions),
  'current_decision_owner_mismatch',(select count(*) from public.parent_decisions d join public.trial_applications a on a.id=d.application_id where d.superseded_at is null and d.parent_id is distinct from a.parent_id),
  'decision_history_without_current',(select count(*) from (select application_id from public.parent_decisions group by application_id having count(*) filter(where superseded_at is null)=0) s),
  'feedback_table_exists',to_regclass('public.experience_feedback') is not null,
  'parent_insert_policies',(select jsonb_agg(jsonb_build_object('name',policyname,'check',with_check)) from pg_policies where schemaname='public' and tablename='trial_applications' and cmd='INSERT'),
  'operator_initial_defaults',(select jsonb_object_agg(column_name,coalesce(column_default,'NULL')) from information_schema.columns where table_schema='public' and table_name='trial_applications' and column_name in ('status','registration_status','completed_at','canceled_at','no_show_at','confirmed_slot_at','confirmed_schedule_block_id','contacted_at','scheduled_at','last_activity_at','next_contact_at'))
) as preflight;
rollback;
