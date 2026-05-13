do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schedule_blocks'
      and column_name = 'capacity'
  ) then
    alter table public.schedule_blocks
      add column capacity integer not null default 1;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedule_blocks_capacity_check'
      and conrelid = 'public.schedule_blocks'::regclass
  ) then
    alter table public.schedule_blocks
      add constraint schedule_blocks_capacity_check
      check (capacity >= 1);
  end if;
end
$$;

create index if not exists trial_applications_class_requested_slot_active_idx
  on public.trial_applications (class_id, requested_slot_at)
  where status in ('new', 'reviewing', 'confirmed');

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_blocks'
      and policyname = 'schedule_blocks_parent_read_public_available_for_active_classes'
  ) then
    execute $policy$
      create policy schedule_blocks_parent_read_public_available_for_active_classes
      on public.schedule_blocks
      for select
      to authenticated
      using (
        app.current_role() = 'parent'
        and type = 'available'
        and start_at > now()
        and exists (
          select 1
          from public.classes c
          where c.teacher_id = schedule_blocks.teacher_id
            and c.is_active = true
        )
      )
    $policy$;
  end if;
end
$$;
