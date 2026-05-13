-- Phase 2-3: atomic RLS transition.
-- Order in this migration:
-- 1) create teacher-centered policies
-- 2) verify policy creation
-- 3) drop legacy operator/mixed policies

-- profiles
drop policy if exists profiles_select_self_or_teacher_same_org on public.profiles;
create policy profiles_select_self_or_teacher_same_org
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id is not distinct from app.current_org_id()
  )
);

-- teachers
drop policy if exists teachers_select_self_or_teacher_same_org on public.teachers;
create policy teachers_select_self_or_teacher_same_org
on public.teachers
for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
);

drop policy if exists teachers_update_self_or_teacher_same_org on public.teachers;
create policy teachers_update_self_or_teacher_same_org
on public.teachers
for update
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
)
with check (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
);

-- classes
drop policy if exists classes_teacher_read_org on public.classes;
create policy classes_teacher_read_org
on public.classes
for select
to authenticated
using (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
);

drop policy if exists classes_teacher_write_org on public.classes;
create policy classes_teacher_write_org
on public.classes
for all
to authenticated
using (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
)
with check (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
);

-- schedule_blocks
drop policy if exists schedule_blocks_teacher_read_org on public.schedule_blocks;
create policy schedule_blocks_teacher_read_org
on public.schedule_blocks
for select
to authenticated
using (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
);

drop policy if exists schedule_blocks_teacher_write_org on public.schedule_blocks;
create policy schedule_blocks_teacher_write_org
on public.schedule_blocks
for all
to authenticated
using (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
)
with check (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
);

-- trial_applications
drop policy if exists trial_applications_teacher_read_org on public.trial_applications;
create policy trial_applications_teacher_read_org
on public.trial_applications
for select
to authenticated
using (
  app.current_role() = 'teacher'
  and exists (
    select 1
    from public.classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
);

drop policy if exists trial_applications_teacher_update_org on public.trial_applications;
create policy trial_applications_teacher_update_org
on public.trial_applications
for update
to authenticated
using (
  app.current_role() = 'teacher'
  and exists (
    select 1
    from public.classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
)
with check (
  app.current_role() = 'teacher'
  and exists (
    select 1
    from public.classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
);

-- application_logs
drop policy if exists application_logs_teacher_read_org on public.application_logs;
create policy application_logs_teacher_read_org
on public.application_logs
for select
to authenticated
using (
  app.current_role() = 'teacher'
  and exists (
    select 1
    from public.trial_applications ta
    join public.classes c on c.id = ta.class_id
    where ta.id = application_logs.application_id
      and c.organization_id = app.current_org_id()
  )
);

drop policy if exists application_logs_teacher_insert_org on public.application_logs;
create policy application_logs_teacher_insert_org
on public.application_logs
for insert
to authenticated
with check (
  app.current_role() = 'teacher'
  and actor_id = auth.uid()
  and exists (
    select 1
    from public.trial_applications ta
    join public.classes c on c.id = ta.class_id
    where ta.id = application_logs.application_id
      and c.organization_id = app.current_org_id()
  )
);

-- Verify all required teacher policies exist before dropping legacy policies.
do $$
declare
  required_count integer;
begin
  select count(*)
  into required_count
  from pg_policies
  where schemaname = 'public'
    and (
      (tablename = 'profiles' and policyname = 'profiles_select_self_or_teacher_same_org')
      or (tablename = 'teachers' and policyname = 'teachers_select_self_or_teacher_same_org')
      or (tablename = 'teachers' and policyname = 'teachers_update_self_or_teacher_same_org')
      or (tablename = 'classes' and policyname = 'classes_teacher_read_org')
      or (tablename = 'classes' and policyname = 'classes_teacher_write_org')
      or (tablename = 'schedule_blocks' and policyname = 'schedule_blocks_teacher_read_org')
      or (tablename = 'schedule_blocks' and policyname = 'schedule_blocks_teacher_write_org')
      or (tablename = 'trial_applications' and policyname = 'trial_applications_teacher_read_org')
      or (tablename = 'trial_applications' and policyname = 'trial_applications_teacher_update_org')
      or (tablename = 'application_logs' and policyname = 'application_logs_teacher_read_org')
      or (tablename = 'application_logs' and policyname = 'application_logs_teacher_insert_org')
    );

  if required_count <> 11 then
    raise exception
      'teacher policy creation check failed. expected 11, got %',
      required_count;
  end if;
end
$$;

-- Drop legacy operator/mixed policies after new teacher policies are in place.
drop policy if exists profiles_select_self_or_operator_same_org on public.profiles;
drop policy if exists teachers_select_self_or_operator_org on public.teachers;
drop policy if exists teachers_update_self_or_operator_org on public.teachers;
drop policy if exists classes_operator_read_org on public.classes;
drop policy if exists classes_operator_write_org on public.classes;
drop policy if exists schedule_blocks_teacher_or_operator_read on public.schedule_blocks;
drop policy if exists schedule_blocks_teacher_or_operator_write on public.schedule_blocks;
drop policy if exists trial_applications_teacher_select_assigned on public.trial_applications;
drop policy if exists trial_applications_operator_select_org on public.trial_applications;
drop policy if exists trial_applications_operator_update_org on public.trial_applications;
drop policy if exists application_logs_teacher_select_assigned on public.application_logs;
drop policy if exists application_logs_operator_select_org on public.application_logs;
drop policy if exists application_logs_operator_insert_org on public.application_logs;
