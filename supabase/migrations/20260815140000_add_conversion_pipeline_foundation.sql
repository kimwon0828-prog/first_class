alter table public.trial_applications
  add column if not exists next_contact_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists unregistered_reason_note text;

do $$
declare
  invalid_reason_count integer;
begin
  select count(*)
  into invalid_reason_count
  from public.trial_applications
  where unregistered_reason is not null
    and unregistered_reason not in (
      'schedule_mismatch',
      'cost_burden',
      'distance',
      'child_reaction',
      'comparing_other_academies',
      'no_response',
      'other',
      'class_level_mismatch'
    );

  if invalid_reason_count <> 0 then
    raise exception
      'trial_applications.unregistered_reason contains unsupported values: % rows',
      invalid_reason_count;
  end if;
end
$$;

alter table public.trial_applications
  drop constraint if exists trial_applications_unregistered_reason_check;

alter table public.trial_applications
  add constraint trial_applications_unregistered_reason_check
  check (
    unregistered_reason is null
    or unregistered_reason in (
      'schedule_mismatch',
      'cost_burden',
      'distance',
      'child_reaction',
      'comparing_other_academies',
      'no_response',
      'other',
      'class_level_mismatch'
    )
  );

create table if not exists public.trial_results (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.trial_applications(id) on delete cascade,
  observations text[] not null default '{}'::text[],
  parent_reaction text,
  recommended_course text,
  recommended_level text,
  recommended_schedule text,
  next_action text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_results_application_id_key unique (application_id)
);

create table if not exists public.consultation_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.trial_applications(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  activity_type text not null,
  channel text,
  sentiment text,
  next_action text,
  next_contact_at timestamptz,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.trial_results'::regclass
      and tgname = 'set_trial_results_updated_at'
      and not tgisinternal
  ) then
    create trigger set_trial_results_updated_at
    before update on public.trial_results
    for each row execute function public.set_updated_at();
  end if;
end
$$;

create index if not exists trial_applications_consulting_queue_idx
  on public.trial_applications (assigned_teacher_id, next_contact_at asc nulls last, last_activity_at desc nulls last)
  where status = 'completed'
    and (
      registration_status is null
      or registration_status in ('undecided', 'pending')
    );

create index if not exists trial_applications_enrolled_at_idx
  on public.trial_applications (enrolled_at desc)
  where registration_status = 'enrolled';

create index if not exists trial_applications_lost_at_idx
  on public.trial_applications (lost_at desc)
  where registration_status = 'not_enrolled';

create index if not exists consultation_logs_application_occurred_at_idx
  on public.consultation_logs (application_id, occurred_at desc);

alter table public.trial_results enable row level security;
alter table public.consultation_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_results'
      and policyname = 'trial_results_teacher_read_org'
  ) then
    create policy trial_results_teacher_read_org
    on public.trial_results
    for select
    to authenticated
    using (
      app.current_role() = 'teacher'
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = trial_results.application_id
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
      and tablename = 'trial_results'
      and policyname = 'trial_results_teacher_insert_org'
  ) then
    create policy trial_results_teacher_insert_org
    on public.trial_results
    for insert
    to authenticated
    with check (
      app.current_role() = 'teacher'
      and (created_by is null or created_by = auth.uid())
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = trial_results.application_id
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
      and tablename = 'trial_results'
      and policyname = 'trial_results_teacher_update_org'
  ) then
    create policy trial_results_teacher_update_org
    on public.trial_results
    for update
    to authenticated
    using (
      app.current_role() = 'teacher'
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = trial_results.application_id
          and c.organization_id = app.current_org_id()
      )
    )
    with check (
      app.current_role() = 'teacher'
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = trial_results.application_id
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
      and tablename = 'consultation_logs'
      and policyname = 'consultation_logs_teacher_read_org'
  ) then
    create policy consultation_logs_teacher_read_org
    on public.consultation_logs
    for select
    to authenticated
    using (
      app.current_role() = 'teacher'
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = consultation_logs.application_id
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
      and tablename = 'consultation_logs'
      and policyname = 'consultation_logs_teacher_insert_org'
  ) then
    create policy consultation_logs_teacher_insert_org
    on public.consultation_logs
    for insert
    to authenticated
    with check (
      app.current_role() = 'teacher'
      and (created_by is null or created_by = auth.uid())
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = consultation_logs.application_id
          and c.organization_id = app.current_org_id()
      )
    );
  end if;
end
$$;

insert into public.trial_results (
  application_id,
  observations,
  recommended_level,
  recommended_schedule,
  note,
  created_at,
  updated_at
)
select
  ta.id,
  '{}'::text[],
  ta.final_level,
  ta.final_schedule,
  ta.trial_feedback,
  coalesce(ta.completed_at, ta.updated_at, ta.created_at),
  coalesce(ta.updated_at, ta.completed_at, ta.created_at)
from public.trial_applications ta
where ta.trial_feedback is not null
   or ta.final_level is not null
   or ta.final_schedule is not null
on conflict (application_id) do nothing;

insert into public.consultation_logs (
  application_id,
  occurred_at,
  activity_type,
  note,
  created_by,
  created_at
)
select
  ta.id,
  coalesce(ta.updated_at, ta.completed_at, ta.created_at),
  'LEGACY_IMPORT',
  trim(
    concat_ws(
      E'\n\n',
      case
        when ta.consultation_note is not null and btrim(ta.consultation_note) <> ''
          then '기존 상담 메모' || E'\n' || btrim(ta.consultation_note)
        else null
      end,
      case
        when ta.follow_up_note is not null and btrim(ta.follow_up_note) <> ''
          then '기존 후속 메모' || E'\n' || btrim(ta.follow_up_note)
        else null
      end
    )
  ),
  null,
  coalesce(ta.updated_at, ta.completed_at, ta.created_at)
from public.trial_applications ta
where (
    (ta.consultation_note is not null and btrim(ta.consultation_note) <> '')
    or (ta.follow_up_note is not null and btrim(ta.follow_up_note) <> '')
  )
  and not exists (
    select 1
    from public.consultation_logs cl
    where cl.application_id = ta.id
      and cl.activity_type = 'LEGACY_IMPORT'
  );
