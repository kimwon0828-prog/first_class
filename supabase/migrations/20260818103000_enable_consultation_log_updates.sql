do $$
declare
  has_updated_at boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'consultation_logs'
      and column_name = 'updated_at'
  )
  into has_updated_at;

  if not has_updated_at then
    alter table public.consultation_logs
      add column updated_at timestamptz;

    update public.consultation_logs
    set updated_at = created_at
    where updated_at is null;

    alter table public.consultation_logs
      alter column updated_at set default now();

    alter table public.consultation_logs
      alter column updated_at set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.consultation_logs'::regclass
      and tgname = 'set_consultation_logs_updated_at'
      and not tgisinternal
  ) then
    create trigger set_consultation_logs_updated_at
    before update on public.consultation_logs
    for each row execute function public.set_updated_at();
  end if;
end
$$;

revoke update on table public.consultation_logs from authenticated;

grant update (channel, note, next_contact_at)
on table public.consultation_logs
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'consultation_logs'
      and policyname = 'consultation_logs_teacher_update_org'
  ) then
    create policy consultation_logs_teacher_update_org
    on public.consultation_logs
    for update
    to authenticated
    using (
      app.current_role() = 'teacher'
      and activity_type = 'CONSULTATION'
      and exists (
        select 1
        from public.trial_applications ta
        join public.classes c on c.id = ta.class_id
        where ta.id = consultation_logs.application_id
          and c.organization_id = app.current_org_id()
      )
    )
    with check (
      app.current_role() = 'teacher'
      and activity_type = 'CONSULTATION'
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
