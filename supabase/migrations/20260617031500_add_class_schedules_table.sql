create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  schedule_type text not null,
  day_of_week smallint,
  specific_date date,
  start_time time not null,
  end_time time not null,
  capacity integer,
  display_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedules_schedule_type_check
    check (schedule_type in ('weekly', 'one_time')),
  constraint class_schedules_day_of_week_check
    check (day_of_week is null or day_of_week between 0 and 6),
  constraint class_schedules_capacity_check
    check (capacity is null or capacity >= 1),
  constraint class_schedules_time_check
    check (end_time > start_time),
  constraint class_schedules_shape_check
    check (
      (schedule_type = 'weekly' and day_of_week is not null and specific_date is null)
      or
      (schedule_type = 'one_time' and day_of_week is null and specific_date is not null)
    )
);

create index if not exists class_schedules_class_id_idx
  on public.class_schedules (class_id);

create index if not exists class_schedules_class_id_sort_order_idx
  on public.class_schedules (class_id, sort_order, created_at);

alter table public.class_schedules enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_schedules'
      and policyname = 'class_schedules_teacher_read_org'
  ) then
    create policy class_schedules_teacher_read_org
    on public.class_schedules
    for select
    to authenticated
    using (
      app.current_role() in ('teacher', 'operator')
      and exists (
        select 1
        from public.classes c
        where c.id = class_schedules.class_id
          and c.organization_id = app.current_org_id()
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_schedules'
      and policyname = 'class_schedules_teacher_write_org'
  ) then
    create policy class_schedules_teacher_write_org
    on public.class_schedules
    for all
    to authenticated
    using (
      app.current_role() in ('teacher', 'operator')
      and exists (
        select 1
        from public.classes c
        where c.id = class_schedules.class_id
          and c.organization_id = app.current_org_id()
      )
    )
    with check (
      app.current_role() in ('teacher', 'operator')
      and exists (
        select 1
        from public.classes c
        where c.id = class_schedules.class_id
          and c.organization_id = app.current_org_id()
      )
    );
  end if;
end
$$;
