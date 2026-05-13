create schema if not exists app;

create or replace function app.current_role()
returns text
language sql
stable
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function app.current_org_id()
returns uuid
language sql
stable
as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function app.current_teacher_id()
returns uuid
language sql
stable
as $$
  select id from teachers where profile_id = auth.uid()
$$;

alter table profiles enable row level security;
alter table teachers enable row level security;
alter table classes enable row level security;
alter table schedule_blocks enable row level security;
alter table trial_applications enable row level security;
alter table application_logs enable row level security;

create policy profiles_select_self_or_operator_same_org
on profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    app.current_role() = 'operator'
    and organization_id is not distinct from app.current_org_id()
  )
);

create policy profiles_insert_self_parent
on profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'parent'
  and organization_id is null
);

create policy profiles_update_self_only
on profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy teachers_select_self_or_operator_org
on teachers
for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'operator'
    and organization_id = app.current_org_id()
  )
);

create policy teachers_update_self_or_operator_org
on teachers
for update
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'operator'
    and organization_id = app.current_org_id()
  )
)
with check (
  profile_id = auth.uid()
  or (
    app.current_role() = 'operator'
    and organization_id = app.current_org_id()
  )
);

create policy classes_public_read_active
on classes
for select
to anon, authenticated
using (is_active = true);

create policy classes_operator_read_org
on classes
for select
to authenticated
using (
  app.current_role() = 'operator'
  and organization_id = app.current_org_id()
);

create policy classes_operator_write_org
on classes
for all
to authenticated
using (
  app.current_role() = 'operator'
  and organization_id = app.current_org_id()
)
with check (
  app.current_role() = 'operator'
  and organization_id = app.current_org_id()
);

create policy schedule_blocks_teacher_or_operator_read
on schedule_blocks
for select
to authenticated
using (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'operator'
    and exists (
      select 1
      from teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
);

create policy schedule_blocks_teacher_or_operator_write
on schedule_blocks
for all
to authenticated
using (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'operator'
    and exists (
      select 1
      from teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
)
with check (
  teacher_id = app.current_teacher_id()
  or (
    app.current_role() = 'operator'
    and exists (
      select 1
      from teachers t
      where t.id = schedule_blocks.teacher_id
        and t.organization_id = app.current_org_id()
    )
  )
);

create policy trial_applications_parent_select_self
on trial_applications
for select
to authenticated
using (
  parent_id = auth.uid()
);

create policy trial_applications_parent_insert_self
on trial_applications
for insert
to authenticated
with check (
  parent_id = auth.uid()
  and app.current_role() = 'parent'
);

create policy trial_applications_teacher_select_assigned
on trial_applications
for select
to authenticated
using (
  assigned_teacher_id = app.current_teacher_id()
);

create policy trial_applications_operator_select_org
on trial_applications
for select
to authenticated
using (
  app.current_role() = 'operator'
  and exists (
    select 1
    from classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
);

create policy trial_applications_operator_update_org
on trial_applications
for update
to authenticated
using (
  app.current_role() = 'operator'
  and exists (
    select 1
    from classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
)
with check (
  app.current_role() = 'operator'
  and exists (
    select 1
    from classes c
    where c.id = trial_applications.class_id
      and c.organization_id = app.current_org_id()
  )
);

create policy application_logs_parent_select_self
on application_logs
for select
to authenticated
using (
  exists (
    select 1
    from trial_applications ta
    where ta.id = application_logs.application_id
      and ta.parent_id = auth.uid()
  )
);

create policy application_logs_teacher_select_assigned
on application_logs
for select
to authenticated
using (
  exists (
    select 1
    from trial_applications ta
    where ta.id = application_logs.application_id
      and ta.assigned_teacher_id = app.current_teacher_id()
  )
);

create policy application_logs_operator_select_org
on application_logs
for select
to authenticated
using (
  app.current_role() = 'operator'
  and exists (
    select 1
    from trial_applications ta
    join classes c on c.id = ta.class_id
    where ta.id = application_logs.application_id
      and c.organization_id = app.current_org_id()
  )
);

create policy application_logs_operator_insert_org
on application_logs
for insert
to authenticated
with check (
  app.current_role() = 'operator'
  and actor_id = auth.uid()
  and exists (
    select 1
    from trial_applications ta
    join classes c on c.id = ta.class_id
    where ta.id = application_logs.application_id
      and c.organization_id = app.current_org_id()
  )
);
